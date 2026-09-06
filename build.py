
import os
import subprocess
import sys

def build_and_run():
    print("🛠️ جاري تجميع كود C++...")
    cpp_source = "engine.cpp"
    
    if sys.platform.startswith('win'):
        output_lib = "engine.dll"
        cmd = f"g++ -shared -o {output_lib} {cpp_source}"
    else:
        output_lib = "engine.so"
        cmd = f"g++ -shared -fPIC -o {output_lib} {cpp_source}"

    res = subprocess.run(cmd, shell=True)
    if res.returncode == 0:
        print("✅ تم التجميع بنجاح! جاري تشغيل التطبيق...\n")
        subprocess.run([sys.executable, "app.py"])
    else:
        print("❌ فشل تجميع كود C++. تأكد من وجود مثبت g++.")

if __name__ == "__main__":
    build_and_run()
