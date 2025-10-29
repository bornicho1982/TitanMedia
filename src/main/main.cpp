#include <napi.h>
#include <obs.h>
#include <obs-audio-controls.h>
#include <iostream>
#include <vector>
#include <mutex>
#include <string>
#include <map>

// --- Global variables & state ---
static std::vector<uint8_t> latest_frame_data;
static uint32_t frame_width = 0;
static uint32_t frame_height = 0;
static std::mutex frame_mutex;
static bool obs_is_running = false;
struct VolmeterData {
    obs_volmeter_t* volmeter;
    std::string* name_ptr;
};
static std::map<std::string, VolmeterData> g_volmeters;
static std::map<std::string, float> g_peak_levels;
static std::mutex g_audio_mutex;

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
    gs_texture_t *tex = obs_get_main_texture();
    if (!tex) return;

    uint32_t width = gs_texture_get_width(tex);
    uint32_t height = gs_texture_get_height(tex);
    if (width == 0 || height == 0) return;

    uint8_t *video_data = nullptr;
    uint32_t video_linesize = 0;

    if (gs_texture_map(tex, &video_data, &video_linesize)) {
        std::lock_guard<std::mutex> lock(frame_mutex);
        frame_width = width;
        frame_height = height;
        size_t data_size = width * height * 4;
        if (latest_frame_data.size() != data_size) {
            latest_frame_data.resize(data_size);
        }
        for (uint32_t i = 0; i < height; i++) {
            memcpy(latest_frame_data.data() + (i * width * 4),
                   video_data + (i * video_linesize),
                   width * 4);
        }
        gs_texture_unmap(tex);
    }
}

// --- N-API Functions ---

Napi::Value StartupOBS(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (obs_is_running) return env.Undefined();

    if (!obs_startup("en-US", nullptr, nullptr)) {
        throw Napi::Error::New(env, "obs_startup failed");
    }
    obs_add_main_render_callback(main_render_callback, nullptr);
    obs_is_running = true;
    return env.Undefined();
}

Napi::Value ShutdownOBS(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!obs_is_running) return env.Undefined();

    obs_remove_main_render_callback(main_render_callback, nullptr);
    obs_shutdown();
    obs_is_running = false;
    return env.Undefined();
}

Napi::Value GetLatestFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(frame_mutex);
    if (latest_frame_data.empty()) return env.Null();

    Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, latest_frame_data.data(), latest_frame_data.size());
    Napi::Object result = Napi::Object::New(env);
    result.Set("data", buffer);
    result.Set("width", Napi::Number::New(env, frame_width));
    result.Set("height", Napi::Number::New(env, frame_height));
    return result;
}

Napi::Value CreateScene(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Scene name is required.");

    std::string scene_name = info[0].As<Napi::String>();
    obs_scene_t *scene = obs_scene_create(scene_name.c_str());
    if (!scene) throw Napi::Error::New(env, "Failed to create scene.");

    obs_scene_release(scene);
    return env.Undefined();
}

Napi::Value SetCurrentScene(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Scene name is required.");

    std::string scene_name = info[0].As<Napi::String>();
    obs_source_t *source = obs_get_source_by_name(scene_name.c_str());
    if (!source) throw Napi::Error::New(env, "Scene not found.");

    obs_set_output_source(0, source);
    obs_source_release(source);
    return env.Undefined();
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


// --- Module Initialization ---
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startup", Napi::Function::New(env, StartupOBS));
  exports.Set("shutdown", Napi::Function::New(env, ShutdownOBS));
  exports.Set("getLatestFrame", Napi::Function::New(env, GetLatestFrame));
  exports.Set("createScene", Napi::Function::New(env, CreateScene));
  exports.Set("setCurrentScene", Napi::Function::New(env, SetCurrentScene));
  exports.Set("getSceneList", Napi::Function::New(env, GetSceneList));
  exports.Set("getSceneSources", Napi::Function::New(env, GetSceneSources));
  exports.Set("addSource", Napi::Function::New(env, AddSource));
  exports.Set("removeSource", Napi::Function::New(env, RemoveSource));
  exports.Set("getSourceProperties", Napi::Function::New(env, GetSourceProperties));
  exports.Set("updateSourceProperties", Napi::Function::New(env, UpdateSourceProperties));
  exports.Set("setSourceMuted", Napi::Function::New(env, SetSourceMuted));
  exports.Set("isSourceMuted", Napi::Function::New(env, IsSourceMuted));
  exports.Set("getAudioLevels", Napi::Function::New(env, GetAudioLevels));

  return exports;
}

NODE_API_MODULE(titan_media_core, Init)
