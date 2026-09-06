#include <cmath>

extern "C" {
    // دالة حساب هبوط الجهد
    double calculate_voltage_drop(double I, double L, double R, double V_nominal) {
        double drop_volts = (2.0 * I * L * (R / 1000.0));
        return (drop_volts / V_nominal) * 100.0;
    }

    // دالة التحقق من سلامة الكابل (أقل من 3%)
    bool is_cable_safe(double drop_percentage) {
        return drop_percentage <= 3.0;
    }
}

