#include <napi.h>
#include <obs.h>
#include <iostream>

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
    obs_shutdown();
    std::cout << "OBS shutdown successful!" << std::endl;
    return env.Undefined();
}

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("hello", Napi::Function::New(env, HelloMethod));
  exports.Set("startup", Napi::Function::New(env, StartupOBS));
  exports.Set("shutdown", Napi::Function::New(env, ShutdownOBS));
  return exports;
}

NODE_API_MODULE(titan_media_core, Init)
