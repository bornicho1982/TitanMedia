#include <napi.h>
#include <obs.h>
#include <obs-audio-controls.h>
#include "obs-encoder.h"
#include "obs-output.h"
#include <iostream>
#include <vector>
#include <mutex>
#include <string>
#include <map>

// --- Global variables & state ---
static std::vector<uint8_t> g_program_frame_data;
static std::vector<uint8_t> g_preview_frame_data;
static uint32_t g_frame_width = 0;
static uint32_t g_frame_height = 0;
static std::mutex g_frame_mutex;
static bool obs_is_running = false;

// --- Studio Mode ---
static obs_source_t* g_main_transition = nullptr;
static obs_source_t* g_preview_scene = nullptr;
static gs_texrender_t* g_preview_texrender = nullptr;

struct VolmeterData {
    obs_volmeter_t* volmeter;
    std::string* name_ptr;
};
static std::map<std::string, VolmeterData> g_volmeters;
static std::map<std::string, float> g_peak_levels;
static std::mutex g_audio_mutex;

// --- Output Management ---
static obs_output_t* g_stream_output = nullptr;
static obs_output_t* g_record_output = nullptr;
static obs_encoder_t* g_video_encoder = nullptr;
static obs_encoder_t* g_audio_encoder = nullptr;


// --- OBS Audio Callback ---
void volmeter_callback(void *param, const float magnitude[MAX_AUDIO_CHANNELS],
                       const float peak[MAX_AUDIO_CHANNELS],
                       const float input_peak[MAX_AUDIO_CHANNELS]) {
    std::string* name = static_cast<std::string*>(param);
    float peak_db = obs_mul_to_db(peak[0]);
    std::lock_guard<std::mutex> lock(g_audio_mutex);
    g_peak_levels[*name] = peak_db;
}

// --- OBS Render Callback ---
void main_render_callback(void *param, uint32_t cx, uint32_t cy) {
    gs_texture_t *program_tex = obs_get_main_texture();
    if (!program_tex) return;

    uint32_t width = gs_texture_get_width(program_tex);
    uint32_t height = gs_texture_get_height(program_tex);
    if (width == 0 || height == 0) return;

    uint8_t *video_data = nullptr;
    uint32_t video_linesize = 0;

    if (gs_texture_map(program_tex, &video_data, &video_linesize)) {
        std::lock_guard<std::mutex> lock(g_frame_mutex);
        g_frame_width = width;
        g_frame_height = height;
        size_t data_size = width * height * 4;
        if (g_program_frame_data.size() != data_size) {
            g_program_frame_data.resize(data_size);
        }
        for (uint32_t i = 0; i < height; i++) {
            memcpy(g_program_frame_data.data() + (i * width * 4), video_data + (i * video_linesize), width * 4);
        }
        gs_texture_unmap(program_tex);
    }

    if (g_preview_scene) {
        if (gs_texrender_begin(g_preview_texrender, width, height)) {
            obs_source_video_render(g_preview_scene);
            gs_texrender_end(g_preview_texrender);

            gs_texture_t* preview_tex = gs_texrender_get_texture(g_preview_texrender);
            if (preview_tex && gs_texture_map(preview_tex, &video_data, &video_linesize)) {
                std::lock_guard<std::mutex> lock(g_frame_mutex);
                size_t data_size = width * height * 4;
                if (g_preview_frame_data.size() != data_size) {
                    g_preview_frame_data.resize(data_size);
                }
                for (uint32_t i = 0; i < height; i++) {
                    memcpy(g_preview_frame_data.data() + (i * width * 4), video_data + (i * video_linesize), width * 4);
                }
                gs_texture_unmap(preview_tex);
            }
        }
    } else {
        std::lock_guard<std::mutex> lock(g_frame_mutex);
        if (!g_preview_frame_data.empty()) {
            g_preview_frame_data.clear();
        }
    }
}

// --- N-API Functions ---
Napi::Value StartupOBS(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (obs_is_running) return env.Undefined();
    if (!obs_startup("en-US", nullptr, nullptr)) {
        throw Napi::Error::New(env, "obs_startup failed");
    }
    g_main_transition = obs_source_create("cut_transition", "Main Transition", nullptr, nullptr);
    obs_set_output_source(0, g_main_transition);
    g_preview_texrender = gs_texrender_create(GS_RGBA, GS_ZS_NONE);
    obs_add_main_render_callback(main_render_callback, nullptr);
    obs_is_running = true;
    return env.Undefined();
}

Napi::Value ShutdownOBS(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!obs_is_running) return env.Undefined();
    obs_remove_main_render_callback(main_render_callback, nullptr);
    gs_texrender_destroy(g_preview_texrender);
    obs_source_release(g_main_transition);
    obs_shutdown();
    obs_is_running = false;
    return env.Undefined();
}

Napi::Value GetLatestFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(g_frame_mutex);
    Napi::Object result = Napi::Object::New(env);
    if (!g_program_frame_data.empty()) {
        result.Set("programFrame", Napi::Buffer<uint8_t>::Copy(env, g_program_frame_data.data(), g_program_frame_data.size()));
    }
    if (!g_preview_frame_data.empty()) {
        result.Set("previewFrame", Napi::Buffer<uint8_t>::Copy(env, g_preview_frame_data.data(), g_preview_frame_data.size()));
    }
    result.Set("width", Napi::Number::New(env, g_frame_width));
    result.Set("height", Napi::Number::New(env, g_frame_height));
    return result;
}

Napi::Value CreateScene(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Scene name is required.");
    std::string scene_name = info[0].As<Napi::String>();
    obs_scene_t *scene = obs_scene_create(scene_name.c_str());
    if (!scene) throw Napi::Error::New(env, "Failed to create scene.");
    if (obs_transition_get_source(g_main_transition, OBS_TRANSITION_SOURCE_A) == nullptr) {
        obs_transition_set(g_main_transition, (obs_source_t*)scene);
    }
    obs_scene_release(scene);
    return env.Undefined();
}

Napi::Value SetPreviewScene(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Scene name is required.");
    std::string scene_name = info[0].As<Napi::String>();
    obs_source_t *source = obs_get_source_by_name(scene_name.c_str());
    if (!source) throw Napi::Error::New(env, "Scene not found.");
    obs_transition_set(g_main_transition, source);
    g_preview_scene = source;
    obs_source_release(source);
    return env.Undefined();
}

Napi::Value ExecuteTransition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    obs_transition_start(g_main_transition, OBS_TRANSITION_MODE_AUTO, 0, nullptr);
    g_preview_scene = nullptr;
    return env.Undefined();
}

Napi::Value GetProgramSceneName(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    obs_source_t* program_source = obs_transition_get_source(g_main_transition, OBS_TRANSITION_SOURCE_A);
    if (program_source) {
        return Napi::String::New(env, obs_source_get_name(program_source));
    }
    return env.Null();
}

bool enum_scenes_callback(void *param, obs_source_t *source) {
    if (obs_source_get_type(source) == OBS_SOURCE_TYPE_SCENE) {
        auto scene_names = static_cast<std::vector<std::string>*>(param);
        scene_names->push_back(obs_source_get_name(source));
    }
    return true;
}

Napi::Value GetSceneList(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::vector<std::string> scene_names;
    obs_enum_sources(enum_scenes_callback, &scene_names);
    Napi::Array napi_array = Napi::Array::New(env, scene_names.size());
    for (size_t i = 0; i < scene_names.size(); ++i) {
        napi_array.Set(i, Napi::String::New(env, scene_names[i]));
    }
    return napi_array;
}

struct SceneSourcesCallbackData {
    Napi::Env env;
    Napi::Array array;
};

bool enum_scene_sources_callback(obs_scene_t *scene, obs_sceneitem_t *item, void *param) {
    auto data = static_cast<SceneSourcesCallbackData*>(param);
    obs_source_t *source = obs_sceneitem_get_source(item);
    if (source) {
        Napi::Object source_info = Napi::Object::New(data->env);
        source_info.Set("name", Napi::String::New(data->env, obs_source_get_name(source)));
        source_info.Set("hasAudio", Napi::Boolean::New(data->env, (obs_source_get_output_flags(source) & OBS_SOURCE_AUDIO) != 0));
        data->array.Set(data->array.Length(), source_info);
    }
    return true;
}

Napi::Value GetSceneSources(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Scene name is required.");
    std::string scene_name = info[0].As<Napi::String>();
    obs_source_t *scene_source = obs_get_source_by_name(scene_name.c_str());
    if (!scene_source) throw Napi::Error::New(env, "Scene not found.");
    obs_scene_t *scene = obs_scene_from_source(scene_source);
    SceneSourcesCallbackData data = {env, Napi::Array::New(env)};
    obs_scene_enum_items(scene, enum_scene_sources_callback, &data);
    obs_source_release(scene_source);
    return data.array;
}

Napi::Value AddSource(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3) throw Napi::Error::New(env, "Requires 3 arguments: sceneName, sourceId, sourceName");
    std::string scene_name = info[0].As<Napi::String>();
    std::string source_id = info[1].As<Napi::String>();
    std::string source_name = info[2].As<Napi::String>();
    obs_source_t* scene_source = obs_get_source_by_name(scene_name.c_str());
    if (!scene_source) throw Napi::Error::New(env, "Scene not found: " + scene_name);
    obs_scene_t* scene = obs_scene_from_source(scene_source);
    obs_source_t* new_source = obs_source_create(source_id.c_str(), source_name.c_str(), nullptr, nullptr);
    if (!new_source) {
        obs_source_release(scene_source);
        throw Napi::Error::New(env, "Failed to create source with id: " + source_id);
    }
    obs_scene_add(scene, new_source);
    if ((obs_source_get_output_flags(new_source) & OBS_SOURCE_AUDIO) != 0) {
        std::lock_guard<std::mutex> lock(g_audio_mutex);
        obs_volmeter_t* volmeter = obs_volmeter_create(OBS_FADER_LOG);
        std::string* name_ptr = new std::string(source_name);
        obs_volmeter_add_callback(volmeter, volmeter_callback, name_ptr);
        if (obs_volmeter_attach_source(volmeter, new_source)) {
            g_volmeters[source_name] = {volmeter, name_ptr};
        } else {
            obs_volmeter_destroy(volmeter);
            delete name_ptr;
        }
    }
    obs_source_release(new_source);
    obs_source_release(scene_source);
    return env.Undefined();
}

Napi::Value RemoveSource(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) throw Napi::Error::New(env, "Requires 2 arguments: sceneName, sourceName");
    std::string scene_name = info[0].As<Napi::String>();
    std::string source_name = info[1].As<Napi::String>();
    obs_source_t* scene_source = obs_get_source_by_name(scene_name.c_str());
    if (!scene_source) throw Napi::Error::New(env, "Scene not found: " + scene_name);
    obs_scene_t* scene = obs_scene_from_source(scene_source);
    obs_sceneitem_t* scene_item = obs_scene_find_source_recursive(scene, source_name.c_str());
    if (scene_item) {
        obs_sceneitem_remove(scene_item);
        obs_sceneitem_release(scene_item);
    }
    {
        std::lock_guard<std::mutex> lock(g_audio_mutex);
        auto it = g_volmeters.find(source_name);
        if (it != g_volmeters.end()) {
            obs_volmeter_destroy(it->second.volmeter);
            delete it->second.name_ptr;
            g_volmeters.erase(it);
            g_peak_levels.erase(source_name);
        }
    }
    obs_source_release(scene_source);
    return env.Undefined();
}

Napi::Value SetSourceMuted(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) throw Napi::Error::New(env, "Requires 2 arguments: sourceName, muted");
    std::string source_name = info[0].As<Napi::String>();
    bool muted = info[1].As<Napi::Boolean>();
    obs_source_t* source = obs_get_source_by_name(source_name.c_str());
    if (source) {
        obs_source_set_muted(source, muted);
        obs_source_release(source);
    }
    return env.Undefined();
}

Napi::Value IsSourceMuted(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Requires 1 argument: sourceName");
    std::string source_name = info[0].As<Napi::String>();
    bool muted = false;
    obs_source_t* source = obs_get_source_by_name(source_name.c_str());
    if (source) {
        muted = obs_source_muted(source);
        obs_source_release(source);
    }
    return Napi::Boolean::New(env, muted);
}

Napi::Value GetAudioLevels(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object levels = Napi::Object::New(env);
    std::lock_guard<std::mutex> lock(g_audio_mutex);
    for (auto const& [name, peak] : g_peak_levels) {
        levels.Set(name, Napi::Number::New(env, peak));
    }
    return levels;
}

Napi::Value GetSourceProperties(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Requires 1 argument: sourceName");
    std::string source_name = info[0].As<Napi::String>();
    obs_source_t* source = obs_get_source_by_name(source_name.c_str());
    if (!source) return env.Null();
    obs_properties_t* properties = obs_source_properties(source);
    obs_source_release(source);
    if (!properties) return env.Null();
    Napi::Array result = Napi::Array::New(env);
    obs_property_t* prop = obs_properties_first(properties);
    while (prop) {
        Napi::Object prop_obj = Napi::Object::New(env);
        prop_obj.Set("name", Napi::String::New(env, obs_property_name(prop)));
        prop_obj.Set("description", Napi::String::New(env, obs_property_description(prop)));
        obs_property_type type = obs_property_get_type(prop);
        prop_obj.Set("type", Napi::Number::New(env, (int)type));
        if (type == OBS_PROPERTY_LIST) {
            Napi::Array options = Napi::Array::New(env);
            size_t count = obs_property_list_item_count(prop);
            for (size_t i = 0; i < count; ++i) {
                Napi::Object option = Napi::Object::New(env);
                option.Set("name", Napi::String::New(env, obs_property_list_item_name(prop, i)));
                option.Set("value", Napi::String::New(env, obs_property_list_item_string(prop, i)));
                options.Set(i, option);
            }
            prop_obj.Set("options", options);
        }
        result.Set(result.Length(), prop_obj);
        obs_property_next(&prop);
    }
    obs_properties_destroy(properties);
    return result;
}

Napi::Value UpdateSourceProperties(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) throw Napi::Error::New(env, "Requires 2 arguments: sourceName, propertiesObject");
    std::string source_name = info[0].As<Napi::String>();
    Napi::Object props_obj = info[1].As<Napi::Object>();
    obs_source_t* source = obs_get_source_by_name(source_name.c_str());
    if (!source) throw Napi::Error::New(env, "Source not found: " + source_name);
    obs_data_t* settings = obs_data_create();
    Napi::Array prop_names = props_obj.GetPropertyNames();
    for (uint32_t i = 0; i < prop_names.Length(); ++i) {
        Napi::Value key_val = prop_names.Get(i);
        std::string key = key_val.As<Napi::String>();
        Napi::Value val = props_obj.Get(key);
        if (val.IsString()) {
            obs_data_set_string(settings, key.c_str(), val.As<Napi::String>().Utf8Value().c_str());
        } else if (val.IsBoolean()) {
            obs_data_set_bool(settings, key.c_str(), val.As<Napi::Boolean>().Value());
        } else if (val.IsNumber()) {
            obs_data_set_int(settings, key.c_str(), val.As<Napi::Number>().Int64Value());
        }
    }
    obs_source_update(source, settings);
    obs_data_release(settings);
    obs_source_release(source);
    return env.Undefined();
}

void SetupEncoders() {
    g_video_encoder = obs_video_encoder_create("obs_x264", "simple_h264_stream", nullptr, nullptr);
    g_audio_encoder = obs_audio_encoder_create("ffmpeg_aac", "simple_aac", nullptr, 0, nullptr);
    obs_data_t* video_settings = obs_data_create();
    obs_data_set_int(video_settings, "bitrate", 2500);
    obs_data_set_string(video_settings, "rate_control", "CBR");
    obs_encoder_update(g_video_encoder, video_settings);
    obs_data_release(video_settings);
    obs_data_t* audio_settings = obs_data_create();
    obs_data_set_int(audio_settings, "bitrate", 160);
    obs_encoder_update(g_audio_encoder, audio_settings);
    obs_data_release(audio_settings);
}

Napi::Value StartStreaming(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) throw Napi::Error::New(env, "Requires 2 arguments: server, key");
    if (g_stream_output) return env.Undefined();
    SetupEncoders();
    obs_data_t* settings = obs_data_create();
    obs_data_set_string(settings, "server", info[0].As<Napi::String>().Utf8Value().c_str());
    obs_data_set_string(settings, "key", info[1].As<Napi::String>().Utf8Value().c_str());
    g_stream_output = obs_output_create("rtmp_output", "simple_rtmp_stream", settings, nullptr);
    obs_data_release(settings);
    if (!g_stream_output) throw Napi::Error::New(env, "Failed to create stream output.");
    obs_encoder_set_video(g_video_encoder, obs_get_video());
    obs_encoder_set_audio(g_audio_encoder, obs_get_audio());
    obs_output_set_video_encoder(g_stream_output, g_video_encoder);
    obs_output_set_audio_encoder(g_stream_output, g_audio_encoder, 0);
    if (!obs_output_start(g_stream_output)) {
        throw Napi::Error::New(env, "Failed to start stream output.");
    }
    return env.Undefined();
}

Napi::Value StopStreaming(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (g_stream_output) {
        obs_output_stop(g_stream_output);
        obs_output_release(g_stream_output);
        obs_encoder_release(g_video_encoder);
        obs_encoder_release(g_audio_encoder);
        g_stream_output = nullptr;
        g_video_encoder = nullptr;
        g_audio_encoder = nullptr;
    }
    return env.Undefined();
}

Napi::Value IsStreaming(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, g_stream_output && obs_output_active(g_stream_output));
}

Napi::Value StartRecording(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (g_record_output) return env.Undefined();
    if (!g_video_encoder || !g_audio_encoder) {
        SetupEncoders();
    }
    g_record_output = obs_output_create("ffmpeg_muxer", "simple_ffmpeg_muxer", nullptr, nullptr);
    if (!g_record_output) throw Napi::Error::New(env, "Failed to create record output.");
    obs_output_set_video_encoder(g_record_output, g_video_encoder);
    obs_output_set_audio_encoder(g_record_output, g_audio_encoder, 0);
    if (!obs_output_start(g_record_output)) {
        throw Napi::Error::New(env, "Failed to start record output.");
    }
    return env.Undefined();
}

Napi::Value StopRecording(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (g_record_output) {
        obs_output_stop(g_record_output);
        obs_output_release(g_record_output);
        g_record_output = nullptr;
        if (!g_stream_output) {
            obs_encoder_release(g_video_encoder);
            obs_encoder_release(g_audio_encoder);
            g_video_encoder = nullptr;
            g_audio_encoder = nullptr;
        }
    }
    return env.Undefined();
}

Napi::Value IsRecording(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, g_record_output && obs_output_active(g_record_output));
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startup", Napi::Function::New(env, StartupOBS));
  exports.Set("shutdown", Napi::Function::New(env, ShutdownOBS));
  exports.Set("getLatestFrame", Napi::Function::New(env, GetLatestFrame));
  exports.Set("createScene", Napi::Function::New(env, CreateScene));
  exports.Set("getSceneList", Napi::Function::New(env, GetSceneList));
  exports.Set("setPreviewScene", Napi::Function::New(env, SetPreviewScene));
  exports.Set("executeTransition", Napi::Function::New(env, ExecuteTransition));
  exports.Set("getProgramSceneName", Napi::Function::New(env, GetProgramSceneName));
  exports.Set("getSceneSources", Napi::Function::New(env, GetSceneSources));
  exports.Set("addSource", Napi::Function::New(env, AddSource));
  exports.Set("removeSource", Napi::Function::New(env, RemoveSource));
  exports.Set("getSourceProperties", Napi::Function::New(env, GetSourceProperties));
  exports.Set("updateSourceProperties", Napi::Function::New(env, UpdateSourceProperties));
  exports.Set("setSourceMuted", Napi::Function::New(env, SetSourceMuted));
  exports.Set("isSourceMuted", Napi::Function::New(env, IsSourceMuted));
  exports.Set("getAudioLevels", Napi::Function::New(env, GetAudioLevels));
  exports.Set("startStreaming", Napi::Function::New(env, StartStreaming));
  exports.Set("stopStreaming", Napi::Function::New(env, StopStreaming));
  exports.Set("isStreaming", Napi::Function::New(env, IsStreaming));
  exports.Set("startRecording", Napi::Function::New(env, StartRecording));
  exports.Set("stopRecording", Napi::Function::New(env, StopRecording));
  exports.Set("isRecording", Napi::Function::New(env, IsRecording));
  return exports;
}

NODE_API_MODULE(titan_media_core, Init)
