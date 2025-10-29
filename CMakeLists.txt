cmake_minimum_required(VERSION 3.10)
project(titan_media_core)

# Fetch the SIMDE library for SIMD intrinsics
include(FetchContent)
FetchContent_Declare(
  simde
  GIT_REPOSITORY https://github.com/simd-everywhere/simde.git
  GIT_TAG master
)
FetchContent_MakeAvailable(simde)

# Define paths relative to the project root
set(DEPS_DIR ${CMAKE_SOURCE_DIR}/deps)
set(LIBOBS_DIR ${DEPS_DIR}/libobs)

# Set platform-specific paths and library names
if(WIN32)
  set(LIBOBS_INCLUDE_DIR ${LIBOBS_DIR}/include)
  set(LIBOBS_LIB_DIR ${LIBOBS_DIR}/bin/64bit)
  set(LIBOBS_LIBRARY obs)
elseif(UNIX)
  set(LIBOBS_INCLUDE_DIR ${LIBOBS_DIR}/usr/local/include/obs)
  set(LIBOBS_LIB_DIR ${LIBOBS_DIR}/usr/local/lib/x86_64-linux-gnu)
  set(LIBOBS_LIBRARY obs)
endif()

# Add include directories
include_directories(${CMAKE_JS_INC})
include_directories(${simde_SOURCE_DIR})
include_directories(${LIBOBS_INCLUDE_DIR})
include_directories(${CMAKE_SOURCE_DIR}/node_modules/node-addon-api) # Direct path for napi.h

# Add library search path
link_directories(${LIBOBS_LIB_DIR})

# Create the addon
add_library(${PROJECT_NAME} SHARED src/main/main.cpp)

# Link against libobs
target_link_libraries(${PROJECT_NAME} ${LIBOBS_LIBRARY})
