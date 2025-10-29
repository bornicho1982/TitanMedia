#include <napi.h>
#include <obs.h>
#include <iostream>
#include <vector>
#include <mutex>
#include <string>

// --- Global variables for video frame data ---
static std::vector<uint8_t> latest_frame_data;
static uint32_t frame_width = 0;
static uint32_t frame_height = 0;
static std::mutex frame_mutex;
static bool obs_is_running = false;

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

// Helper to add a source to a named scene
void AddSourceToScene(const Napi::CallbackInfo& info, const char* source_id, const char* source_name) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) throw Napi::Error::New(env, "Scene name is required.");
    std::string scene_name = info[0].As<Napi::String>();

    obs_source_t* scene_source = obs_get_source_by_name(scene_name.c_str());
    if (!scene_source) throw Napi::Error::New(env, "Scene not found.");

    obs_scene_t* scene = obs_scene_from_source(scene_source);
    obs_source_t* new_source = obs_source_create(source_id, source_name, nullptr, nullptr);
    if (!new_source) {
        obs_source_release(scene_source);
        throw Napi::Error::New(env, std::string("Failed to create source: ") + source_id);
    }

    obs_scene_add(scene, new_source);

    obs_source_release(new_source);
    obs_source_release(scene_source);
}

Napi::Value AddVideoCaptureSource(const Napi::CallbackInfo& info) {
    #if defined(_WIN32)
        AddSourceToScene(info, "dshow_input", "Webcam");
    #elif defined(__APPLE__)
        AddSourceToScene(info, "av_capture_input", "Webcam");
    #else
        AddSourceToScene(info, "v4l2_input", "Webcam");
    #endif
    return info.Env().Undefined();
}

Napi::Value AddMicSource(const Napi::CallbackInfo& info) {
    #if defined(_WIN32)
        AddSourceToScene(info, "wasapi_input_capture", "Mic/Aux");
    #elif defined(__APPLE__)
        AddSourceToScene(info, "coreaudio_input_capture", "Mic/Aux");
    #else
        AddSourceToScene(info, "pulse_input_capture", "Mic/Aux");
    #endif
    return info.Env().Undefined();
}

// ... other Add...Source functions would follow a similar pattern ...

// --- Module Initialization ---
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startup", Napi::Function::New(env, StartupOBS));
  exports.Set("shutdown", Napi::Function::New(env, ShutdownOBS));
  exports.Set("getLatestFrame", Napi::Function::New(env, GetLatestFrame));
  exports.Set("createScene", Napi::Function::New(env, CreateScene));
  exports.Set("setCurrentScene", Napi::Function::New(env, SetCurrentScene));
  exports.Set("getSceneList", Napi::Function::New(env, GetSceneList));
  exports.Set("addVideoCapture", Napi::Function::New(env, AddVideoCaptureSource));
  exports.Set("addMicSource", Napi::Function::New(env, AddMicSource));

  return exports;
}

NODE_API_MODULE(titan_media_core, Init)
