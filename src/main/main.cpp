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

    // We only care about the peak value of the first channel for simplicity
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

    // --- Render Program Texture ---
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

    // --- Render Preview Texture ---
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

    // Create the main transition that will be our output source
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
        Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, g_program_frame_data.data(), g_program_frame_data.size());
        result.Set("programFrame", buffer);
    }
    if (!g_preview_frame_data.empty()) {
        Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, g_preview_frame_data.data(), g_preview_frame_data.size());
        result.Set("previewFrame", buffer);
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

    // If this is the first scene, set it to program view
    if (obs_transition_get_source(g_main_transition, OBS_TRANSITION_SOURCE_A) == nullptr) {
        obs_transition_set(g_main_transition, (obs_source_t*)scene);
    }

    obs_scene_release(scene);
    return env.Undefined();
}

// --- Studio Mode Functions ---

Napi::Value SetPreviewScene(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Scene name is required.");

    std::string scene_name = info[0].As<Napi::String>();
    obs_source_t *source = obs_get_source_by_name(scene_name.c_str());
    if (!source) throw Napi::Error::New(env, "Scene not found.");

    // With a simple transition like "cut", setting source B is not how it works.
    // We set it as the *next* source for the main transition.
    obs_transition_set(g_main_transition, source);
    g_preview_scene = source; // Keep a reference for manual rendering

    obs_source_release(source);
    return env.Undefined();
}

Napi::Value ExecuteTransition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    obs_transition_start(g_main_transition, OBS_TRANSITION_MODE_AUTO, 0, nullptr);
    g_preview_scene = nullptr; // Preview becomes program, clear preview scene
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
    return true; // Continue enumeration
}

Napi::Value GetSceneList(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::vector<std::string> scene_names;
    obs_enum_sources(enum_scenes_callback, &scene_names);

    Napi::Array napi_array = Napi::Array::New(env, scene_names.size());
    for (size_t i = 0; i < scene_names.size(); ++i) {
        napi_array[i] = Napi::String::New(env, scene_names[i]);
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
        const char *name = obs_source_get_name(source);
        Napi::Object source_info = Napi::Object::New(data->env);
        source_info.Set("name", Napi::String::New(data->env, name));

        uint32_t flags = obs_source_get_output_flags(source);
        bool has_audio = (flags & OBS_SOURCE_AUDIO) != 0;
        source_info.Set("hasAudio", Napi::Boolean::New(data->env, has_audio));

        data->array[data->array.Length()] = source_info;
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
    if (info.Length() < 3) {
        throw Napi::Error::New(env, "Requires 3 arguments: sceneName, sourceId, sourceName");
    }

    std::string scene_name = info[0].As<Napi::String>();
    std::string source_id = info[1].As<Napi::String>();
    std::string source_name = info[2].As<Napi::String>();

    obs_source_t* scene_source = obs_get_source_by_name(scene_name.c_str());
    if (!scene_source) {
        throw Napi::Error::New(env, "Scene not found: " + scene_name);
    }

    obs_scene_t* scene = obs_scene_from_source(scene_source);
    obs_source_t* new_source = obs_source_create(source_id.c_str(), source_name.c_str(), nullptr, nullptr);

    if (!new_source) {
        obs_source_release(scene_source);
        throw Napi::Error::New(env, "Failed to create source with id: " + source_id);
    }

    obs_scene_add(scene, new_source);

    // --- Volmeter Management ---
    uint32_t flags = obs_source_get_output_flags(new_source);
    if ((flags & OBS_SOURCE_AUDIO) != 0) {
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
    // --- End Volmeter Management ---

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

    // --- Volmeter Management ---
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
    // --- End Volmeter Management ---

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
    if (info.Length() < 1) {
        throw Napi::Error::New(env, "Requires 1 argument: sourceName");
    }
    std::string source_name = info[0].As<Napi::String>();

    obs_source_t* source = obs_get_source_by_name(source_name.c_str());
    if (!source) {
        return env.Null(); // Return null if source not found
    }

    obs_properties_t* properties = obs_source_properties(source);
    obs_source_release(source); // Release the source reference

    if (!properties) {
        return env.Null(); // No properties available
    }

    Napi::Array result = Napi::Array::New(env);
    obs_property_t* prop = obs_properties_first(properties);

    while (prop) {
        Napi::Object prop_obj = Napi::Object::New(env);
        prop_obj.Set("name", obs_property_name(prop));
        prop_obj.Set("description", obs_property_description(prop));

        obs_property_type type = obs_property_get_type(prop);
        prop_obj.Set("type", (int)type);

        if (type == OBS_PROPERTY_LIST) {
            Napi::Array options = Napi::Array::New(env);
            size_t count = obs_property_list_item_count(prop);
            for (size_t i = 0; i < count; ++i) {
                const char* name = obs_property_list_item_name(prop, i);
                // Assuming string values for simplicity now
                const char* val_str_const = obs_property_list_item_string(prop, i);
                std::string val_str = val_str_const ? val_str_const : "";

                Napi::Object option = Napi::Object::New(env);
                option.Set("name", name);
                option.Set("value", val_str);
                options[i] = option;
            }
            prop_obj.Set("options", options);
        }

        result[result.Length()] = prop_obj;
        obs_property_next(&prop);
    }

    obs_properties_destroy(properties);
    return result;
}

Napi::Value UpdateSourceProperties(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        throw Napi::Error::New(env, "Requires 2 arguments: sourceName, propertiesObject");
    }
    std::string source_name = info[0].As<Napi::String>();
    Napi::Object props_obj = info[1].As<Napi::Object>();

    obs_source_t* source = obs_get_source_by_name(source_name.c_str());
    if (!source) {
        throw Napi::Error::New(env, "Source not found: " + source_name);
    }

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

// --- Output Functions ---

void SetupEncoders() {
    // For simplicity, using x264 for video and AAC for audio
    g_video_encoder = obs_video_encoder_create("obs_x264", "simple_h264_stream", nullptr, nullptr);
    // Note: fdk_aac might not be available on all builds, ffmpeg_aac is a safer default
    g_audio_encoder = obs_audio_encoder_create("ffmpeg_aac", "simple_aac", nullptr, 0, nullptr);

    // Video encoder settings
    obs_data_t* video_settings = obs_data_create();
    obs_data_set_int(video_settings, "bitrate", 2500);
    obs_data_set_string(video_settings, "rate_control", "CBR");
    obs_encoder_update(g_video_encoder, video_settings);
    obs_data_release(video_settings);

    // Audio encoder settings
    obs_data_t* audio_settings = obs_data_create();
    obs_data_set_int(audio_settings, "bitrate", 160);
    obs_encoder_update(g_audio_encoder, audio_settings);
    obs_data_release(audio_settings);
}

Napi::Value StartStreaming(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) throw Napi::Error::New(env, "Requires 2 arguments: server, key");

    std::string server = info[0].As<Napi::String>();
    std::string key = info[1].As<Napi::String>();

    if (g_stream_output) return env.Undefined(); // Already streaming

    SetupEncoders(); // Make sure encoders are ready

    obs_data_t* settings = obs_data_create();
    obs_data_set_string(settings, "server", server.c_str());
    obs_data_set_string(settings, "key", key.c_str());

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
    bool active = g_stream_output && obs_output_active(g_stream_output);
    return Napi::Boolean::New(env, active);
}

Napi::Value StartRecording(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (g_record_output) return env.Undefined(); // Already recording

    // Use separate encoders for recording if not already streaming
    if (!g_video_encoder || !g_audio_encoder) {
        SetupEncoders();
    }

    // For simplicity, hardcoding path. A real app would get this from settings.
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

        // If we are not streaming, release the encoders too
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
    bool active = g_record_output && obs_output_active(g_record_output);
    return Napi::Boolean::New(env, active);
}

// --- Serialization / Deserialization ---

Napi::Object ObsDataToNapiObject(Napi::Env env, obs_data_t* data) {
    Napi::Object obj = Napi::Object::New(env);
    if (!data) return obj;

    obs_data_item_t* item = obs_data_first(data);
    while (item) {
        const char* key = obs_data_item_get_name(item);
        auto type = obs_data_item_get_type(item);

        switch (type) {
            case OBS_DATA_STRING:
                obj.Set(key, obs_data_item_get_string(item));
                break;
            case OBS_DATA_NUMBER:
                obj.Set(key, obs_data_item_get_int(item));
                break;
            case OBS_DATA_BOOLEAN:
                obj.Set(key, obs_data_item_get_bool(item));
                break;
            // Skipping other types for now for simplicity
        }

        obs_data_item_next(&item);
    }
    obs_data_item_release(&item);
    return obj;
}

obs_data_t* NapiObjectToObsData(Napi::Env env, Napi::Object obj) {
    obs_data_t* data = obs_data_create();
    Napi::Array keys = obj.GetPropertyNames();

    for (uint32_t i = 0; i < keys.Length(); i++) {
        Napi::Value key_val = keys.Get(i);
        std::string key = key_val.As<Napi::String>();
        Napi::Value val = obj.Get(key);

        if (val.IsString()) {
            obs_data_set_string(data, key.c_str(), val.As<Napi::String>().Utf8Value().c_str());
        } else if (val.IsNumber()) {
            obs_data_set_int(data, key.c_str(), val.As<Napi::Number>().Int64Value());
        } else if (val.IsBoolean()) {
            obs_data_set_bool(data, key.c_str(), val.As<Napi::Boolean>().Value());
        }
    }
    return data;
}


Napi::Value GetFullSceneData(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    Napi::Array scenes_array = Napi::Array::New(env);
    uint32_t scene_idx = 0;

    auto enum_scenes = [](void *param, obs_source_t *scene_source) {
        if (obs_source_get_type(scene_source) != OBS_SOURCE_TYPE_SCENE) {
            return true; // continue
        }

        auto* data = static_cast<std::tuple<Napi::Env, Napi::Array&>*>(param);
        Napi::Env env = std::get<0>(*data);
        Napi::Array& scenes_array = std::get<1>(*data);

        Napi::Object scene_obj = Napi::Object::New(env);
        scene_obj.Set("name", obs_source_get_name(scene_source));

        Napi::Array sources_array = Napi::Array::New(env);
        uint32_t source_idx = 0;

        obs_scene_t *scene = obs_scene_from_source(scene_source);
        auto enum_items = [](obs_scene_t*, obs_sceneitem_t *item, void *p) {
            auto* item_data = static_cast<std::tuple<Napi::Env, Napi::Array&>*>(p);
            Napi::Env item_env = std::get<0>(*item_data);
            Napi::Array& item_array = std::get<1>(*item_data);
            uint32_t& idx = *static_cast<uint32_t*>(item_data->operator[](2));

            obs_source_t* source = obs_sceneitem_get_source(item);
            if (!source) return true;

            Napi::Object source_obj = Napi::Object::New(item_env);
            source_obj.Set("name", obs_source_get_name(source));
            source_obj.Set("id", obs_source_get_id(source));

            obs_data_t* settings = obs_source_get_settings(source);
            source_obj.Set("settings", ObsDataToNapiObject(item_env, settings));
            obs_data_release(settings);

            // Get transform
            obs_transform_info transform_info;
            obs_sceneitem_get_info(item, &transform_info);
            Napi::Object transform_obj = Napi::Object::New(item_env);
            transform_obj.Set("posX", transform_info.pos.x);
            transform_obj.Set("posY", transform_info.pos.y);
            transform_obj.Set("rot", transform_info.rot);
            transform_obj.Set("scaleX", transform_info.scale.x);
            transform_obj.Set("scaleY", transform_info.scale.y);
            transform_obj.Set("cropTop", transform_info.crop.top);
            transform_obj.Set("cropBottom", transform_info.crop.bottom);
            transform_obj.Set("cropLeft", transform_info.crop.left);
            transform_obj.Set("cropRight", transform_info.crop.right);
            source_obj.Set("transform", transform_obj);

            item_array.Set(idx++, source_obj);
            return true;
        };

        uint32_t s_idx = 0;
        std::tuple<Napi::Env, Napi::Array&, uint32_t*> item_data = {env, sources_array, &s_idx};
        obs_scene_enum_items(scene, enum_items, &item_data);

        scene_obj.Set("sources", sources_array);
        uint32_t& scene_idx_ref = *static_cast<uint32_t*>(data->operator[](2));
        scenes_array.Set(scene_idx_ref++, scene_obj);

        return true;
    };

    std::tuple<Napi::Env, Napi::Array&, uint32_t*> scene_data = {env, scenes_array, &scene_idx};
    obs_enum_sources(enum_scenes, &scene_data);

    result.Set("scenes", scenes_array);
    return result;
}

Napi::Value LoadFullSceneData(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        throw Napi::Error::New(env, "Requires one argument: a scene data object");
    }
    Napi::Object data = info[0].As<Napi::Object>();
    Napi::Array scenes_array = data.Get("scenes").As<Napi::Array>();

    for (uint32_t i = 0; i < scenes_array.Length(); i++) {
        Napi::Object scene_obj = scenes_array.Get(i).As<Napi::Object>();
        std::string scene_name = scene_obj.Get("name").As<Napi::String>();

        obs_scene_t* scene = obs_scene_create(scene_name.c_str());
        obs_source_t* scene_source = (obs_source_t*)scene;

        Napi::Array sources_array = scene_obj.Get("sources").As<Napi::Array>();
        for (uint32_t j = 0; j < sources_array.Length(); j++) {
            Napi::Object source_obj = sources_array.Get(j).As<Napi::Object>();
            std::string source_name = source_obj.Get("name").As<Napi::String>();
            std::string source_id = source_obj.Get("id").As<Napi::String>();

            Napi::Object settings_obj = source_obj.Get("settings").As<Napi::Object>();
            obs_data_t* settings = NapiObjectToObsData(env, settings_obj);

            obs_source_t* new_source = obs_source_create(source_id.c_str(), source_name.c_str(), settings, nullptr);
            obs_data_release(settings);

            if (!new_source) continue;

            obs_sceneitem_t* scene_item = obs_scene_add(scene, new_source);

            // Apply transform
            Napi::Object transform_obj = source_obj.Get("transform").As<Napi::Object>();
            obs_transform_info transform_info;
            transform_info.pos.x = transform_obj.Get("posX").As<Napi::Number>().FloatValue();
            transform_info.pos.y = transform_obj.Get("posY").As<Napi::Number>().FloatValue();
            transform_info.rot = transform_obj.Get("rot").As<Napi::Number>().FloatValue();
            transform_info.scale.x = transform_obj.Get("scaleX").As<Napi::Number>().FloatValue();
            transform_info.scale.y = transform_obj.Get("scaleY").As<Napi::Number>().FloatValue();
            transform_info.crop.top = transform_obj.Get("cropTop").As<Napi::Number>().Int32Value();
            transform_info.crop.bottom = transform_obj.Get("cropBottom").As<Napi::Number>().Int32Value();
            transform_info.crop.left = transform_obj.Get("cropLeft").As<Napi::Number>().Int32Value();
            transform_info.crop.right = transform_obj.Get("cropRight").As<Napi::Number>().Int32Value();
            obs_sceneitem_set_info(scene_item, &transform_info);

            obs_source_release(new_source);
        }

        // Set the first scene as the program scene
        if (i == 0) {
             obs_transition_set(g_main_transition, scene_source);
        }

        obs_scene_release(scene);
    }
    return env.Undefined();
}


// --- Module Initialization ---
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startup", Napi::Function::New(env, StartupOBS));
  exports.Set("shutdown", Napi::Function::New(env, ShutdownOBS));
  exports.Set("getLatestFrame", Napi::Function::New(env, GetLatestFrame));
  exports.Set("createScene", Napi::Function::New(env, CreateScene));
  exports.Set("getSceneList", Napi::Function::New(env, GetSceneList));

  // Studio Mode Functions
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

  // Output Functions
  exports.Set("startStreaming", Napi::Function::New(env, StartStreaming));
  exports.Set("stopStreaming", Napi::Function::New(env, StopStreaming));
  exports.Set("isStreaming", Napi::Function::New(env, IsStreaming));
  exports.Set("startRecording", Napi::Function::New(env, StartRecording));
  exports.Set("stopRecording", Napi::Function::New(env, StopRecording));
  exports.Set("isRecording", Napi::Function::New(env, IsRecording));

  // Serialization Functions
  exports.Set("getFullSceneData", Napi::Function::New(env, GetFullSceneData));
  exports.Set("loadFullSceneData", Napi::Function::New(env, LoadFullSceneData));

  return exports;
}

NODE_API_MODULE(titan_media_core, Init)
