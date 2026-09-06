import ctypes
import os
import sys

def load_cpp_engine():
    if sys.platform.startswith('win'):
        lib_name = './engine.dll'
    elif sys.platform.startswith('darwin'):
        lib_name = './engine.dylib'
    else:
        lib_name = './engine.so'

    engine_path = os.path.abspath(lib_name)
    cpp_lib = ctypes.CDLL(engine_path)

    cpp_lib.calculate_voltage_drop.argtypes = [ctypes.c_double, ctypes.c_double, ctypes.c_double, ctypes.c_double]
    cpp_lib.calculate_voltage_drop.restype = ctypes.c_double

    cpp_lib.is_cable_safe.argtypes = [ctypes.c_double]
    cpp_lib.is_cable_safe.restype = ctypes.c_bool

    return cpp_lib

if __name__ == "__main__":
    try:
        engine = load_cpp_engine()
        drop_percent = engine.calculate_voltage_drop(50.0, 120.0, 0.734, 220.0)
        is_safe = engine.is_cable_safe(drop_percent)

        print("========================================")
        print("⚡ نتيجة المحاكاة المشتركة (C++ + Python)")
        print("========================================")
        print(f"نسبة هبوط الجهد: {drop_percent:.2f}%")
        print("✅ الكابل آمن" if is_safe else "⚠️ هبوط الجهد يتجاوز الحدود!")
        print("========================================")
    except Exception as e:
        print(f"❌ حدث خطأ أثناء التشغيل: {e}")

