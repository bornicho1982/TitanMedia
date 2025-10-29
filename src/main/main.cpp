#include <napi.h>
#include <obs.h>
#include <iostream>
#include <vector>
#include <mutex>

// --- Global variables for video frame data ---
static std::vector<uint8_t> latest_frame_data;
static uint32_t frame_width = 0;
static uint32_t frame_height = 0;
static std::mutex frame_mutex;
static bool obs_is_running = false;

// --- OBS Render Callback ---
void main_render_callback(void *param, uint32_t cx, uint32_t cy) {
    gs_texture_t *tex = obs_get_main_texture();
    if (!tex) {
        return;
    }

    uint32_t width = gs_texture_get_width(tex);
    uint32_t height = gs_texture_get_height(tex);

    if (width == 0 || height == 0) {
        return;
    }

    uint8_t *video_data = nullptr;
    uint32_t video_linesize = 0;

    if (gs_texture_map(tex, &video_data, &video_linesize)) {
        std::lock_guard<std::mutex> lock(frame_mutex);

        frame_width = width;
        frame_height = height;
        size_t data_size = width * height * 4; // Assuming RGBA format

        if (latest_frame_data.size() != data_size) {
            latest_frame_data.resize(data_size);
        }

        // Copy frame data line by line to account for potential pitch differences
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
    if (obs_is_running) {
        return env.Undefined();
    }
    std::cout << "Attempting OBS startup..." << std::endl;

    if (!obs_startup("en-US", nullptr, nullptr)) {
        throw Napi::Error::New(env, "obs_startup failed");
    }

    obs_add_main_render_callback(main_render_callback, nullptr);
    obs_is_running = true;

    std::cout << "OBS startup successful!" << std::endl;
    return env.Undefined();
}

Napi::Value ShutdownOBS(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!obs_is_running) {
        return env.Undefined();
    }
    std::cout << "Attempting OBS shutdown..." << std::endl;

    obs_remove_main_render_callback(main_render_callback, nullptr);
    obs_shutdown();
    obs_is_running = false;

    std::cout << "OBS shutdown successful!" << std::endl;
    return env.Undefined();
}

Napi::Value GetLatestFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(frame_mutex);

    if (latest_frame_data.empty() || frame_width == 0 || frame_height == 0) {
        return env.Null();
    }

    Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, latest_frame_data.data(), latest_frame_data.size());
    Napi::Object result = Napi::Object::New(env);
    result.Set("data", buffer);
    result.Set("width", Napi::Number::New(env, frame_width));
    result.Set("height", Napi::Number::New(env, frame_height));

    return result;
}


// --- Placeholder functions from previous steps ---

Napi::String HelloMethod(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), "Hello from C++!");
}

obs_weak_source_t *main_scene_weak = nullptr;

Napi::Value CreateSceneWithGameCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    obs_scene_t *scene = obs_scene_create("MainScene");
    obs_source_t *main_scene_source = obs_scene_get_source(scene);
    obs_data_t *settings = obs_data_create();
    obs_source_t *game_capture_source = obs_source_create("game_capture", "Game Capture", settings, nullptr);
    obs_data_release(settings);
    obs_scene_add(scene, game_capture_source);
    obs_set_output_source(0, main_scene_source);
    if (main_scene_weak) obs_weak_source_release(main_scene_weak);
    main_scene_weak = obs_source_get_weak_source(main_scene_source);
    obs_source_release(game_capture_source);
    obs_scene_release(scene);
    return env.Undefined();
}
Napi::Value AddVideoCaptureSource(const Napi::CallbackInfo& info) { /* ... implementation ... */ return info.Env().Undefined(); }
Napi::Value AddBrowserSource(const Napi::CallbackInfo& info) { /* ... implementation ... */ return info.Env().Undefined(); }
Napi::Value AddMicSource(const Napi::CallbackInfo& info) { /* ... implementation ... */ return info.Env().Undefined(); }
Napi::Value AddDesktopAudioSource(const Napi::CallbackInfo& info) { /* ... implementation ... */ return info.Env().Undefined(); }


// --- Module Initialization ---
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startup", Napi::Function::New(env, StartupOBS));
  exports.Set("shutdown", Napi::Function::New(env, ShutdownOBS));
  exports.Set("getLatestFrame", Napi::Function::New(env, GetLatestFrame));

  // --- Expose older functions for completeness ---
  exports.Set("hello", Napi::Function::New(env, HelloMethod));
  exports.Set("createScene", Napi::Function::New(env, CreateSceneWithGameCapture));
  exports.Set("addVideoCapture", Napi::Function::New(env, AddVideoCaptureSource));
  exports.Set("addBrowserSource", Napi::Function::New(env, AddBrowserSource));
  exports.Set("addMicSource", Napi::Function::New(env, AddMicSource));
  exports.Set("addDesktopAudioSource", Napi::Function::New(env, AddDesktopAudioSource));
  return exports;
}

NODE_API_MODULE(titan_media_core, Init)
