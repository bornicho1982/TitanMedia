#include <napi.h>
#include <obs.h>
#include <iostream>

// Global weak reference to the main scene
static obs_weak_source_t *main_scene_weak = nullptr;

// "Hello World" function for initial testing
Napi::String HelloMethod(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::cout << "Hello from C++ was called!" << std::endl;
  return Napi::String::New(env, "Hello from C++!");
}

// Function to initialize OBS
Napi::Value StartupOBS(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::cout << "Attempting OBS startup..." << std::endl;

    if (!obs_startup("en-US", nullptr, nullptr)) {
        std::cerr << "OBS startup failed!" << std::endl;
        throw Napi::Error::New(env, "obs_startup failed");
    }

    std::cout << "OBS startup successful!" << std::endl;
    return env.Undefined();
}

// Function to shutdown OBS
Napi::Value ShutdownOBS(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::cout << "Attempting OBS shutdown..." << std::endl;

    // Release the weak reference if it exists
    if (main_scene_weak) {
        obs_weak_source_release(main_scene_weak);
        main_scene_weak = nullptr;
    }

    obs_shutdown();
    std::cout << "OBS shutdown successful!" << std::endl;
    return env.Undefined();
}

// Function to create a scene and add a game capture source
Napi::Value CreateSceneWithGameCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::cout << "Creating scene with game capture..." << std::endl;

    // Create the main scene
    obs_scene_t *scene = obs_scene_create("MainScene");
    if (!scene) {
        throw Napi::Error::New(env, "Failed to create main scene.");
    }
    obs_source_t *main_scene_source = obs_scene_get_source(scene);


    // Create the game capture source
    obs_data_t *settings = obs_data_create();
    obs_source_t *game_capture_source = obs_source_create("game_capture", "Game Capture", settings, nullptr);
    obs_data_release(settings);

    if (!game_capture_source) {
        obs_scene_release(scene);
        throw Napi::Error::New(env, "Failed to create game capture source.");
    }

    // Add the source to the scene
    obs_scene_add(scene, game_capture_source);

    // Set the main scene as the primary output source
    obs_set_output_source(0, main_scene_source);

    // Store a weak reference to the scene
    if (main_scene_weak) {
        obs_weak_source_release(main_scene_weak);
    }
    main_scene_weak = obs_source_get_weak_source(main_scene_source);

    // Release strong references
    obs_source_release(game_capture_source);
    obs_scene_release(scene);

    std::cout << "Scene created and game capture source added." << std::endl;
    return env.Undefined();
}

// Function to add a video capture source to the main scene
Napi::Value AddVideoCaptureSource(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!main_scene_weak) {
        throw Napi::Error::New(env, "Main scene does not exist. Please create a scene first.");
    }

    obs_source_t *main_scene_source = obs_weak_source_get_source(main_scene_weak);
    if (!main_scene_source) {
        throw Napi::Error::New(env, "Main scene reference is no longer valid.");
    }

    obs_scene_t *scene = obs_scene_from_source(main_scene_source);

    // Determine the correct source ID based on the platform
    #if defined(_WIN32)
        const char* source_id = "dshow_input";
    #elif defined(__APPLE__)
        const char* source_id = "av_capture_input";
    #else
        const char* source_id = "v4l2_input";
    #endif

    std::cout << "Adding video capture source (" << source_id << ")..." << std::endl;

    // Create the video capture source
    obs_data_t *settings = obs_data_create();
    obs_source_t *video_capture_source = obs_source_create(source_id, "Webcam", settings, nullptr);
    obs_data_release(settings);

    if (!video_capture_source) {
        obs_source_release(main_scene_source);
        throw Napi::Error::New(env, "Failed to create video capture source.");
    }

    // Add the source to the scene
    obs_scene_add(scene, video_capture_source);

    // Release strong references
    obs_source_release(video_capture_source);
    obs_source_release(main_scene_source);

    std::cout << "Video capture source added." << std::endl;
    return env.Undefined();
}


// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("hello", Napi::Function::New(env, HelloMethod));
  exports.Set("startup", Napi::Function::New(env, StartupOBS));
  exports.Set("shutdown", Napi::Function::New(env, ShutdownOBS));
  exports.Set("createScene", Napi::Function::New(env, CreateSceneWithGameCapture));
  exports.Set("addVideoCapture", Napi::Function::New(env, AddVideoCaptureSource));
  return exports;
}

NODE_API_MODULE(titan_media_core, Init)
