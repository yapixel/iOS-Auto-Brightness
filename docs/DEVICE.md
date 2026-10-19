# 目标设备适配

初始读取日期：2026-10-15。当前分支支持 Google Pixel 7 Pro（cheetah）与联想拯救者 Y700 无极 / 第五代（TB324ZC），运行 Android 12+ / KernelSU。

## 硬件与接口

### 联想拯救者 Y700 无极（第五代 / TB324ZC）
- 主屏 1600 × 2560（物理密度 360 dpi，支持 30/60/120/144/165 Hz），内部显示 ID 为 `local:4630946653341585811`。单内置屏架构，无独立背屏，模块只向 Display 0 发出调光请求。
- 主屏 sysfs 背光节点为 `/sys/class/backlight/panel0-backlight`，最大背光值为 4095。
- 主光线传感器：`stk_stk3a5x Ambient Light Sensor Non-wakeup`（sensortek，`android.sensor.light` 类型，`on-change` 模式）；距离感应器为 `stk_stk3a5x Proximity Sensor Wakeup`。平板硬件无后置辅助光感（标记 `back_sensor: "unavailable"`，`back_lux` 置为 -1）。
- 主屏亮度标定取自显示服务的 `mBacklight` / `mNits`（`/vendor/etc/displayconfig/display_id_4630946653341585811.xml`），共 14 点严格递增映射，记录在 `module/profiles/y700.profile`（最低标定 9.924256 nits @ 0.00024 至峰值 1410.7161 nits @ 1.0）。

### Google Pixel 7 Pro（cheetah）
- 主屏 6.7 英寸 LTPO OLED，支持双分辨率档位切换：QHD+（1440 × 3120，560 dpi）与 FHD+（1080 × 2340，420 dpi），支持 10~120 Hz 自适应刷新率。内部显示 ID 为 `local:4619827677550801152`。
- 主屏 sysfs 背光节点为 `/sys/class/backlight/panel0-backlight`（最大背光 4095）。
- 传感器矩阵：
  - 前置主光感：`TMD3719 Ambient Light`（AMS，`android.sensor.light`，`on-change` 模式，非唤醒）。
  - 后置辅助光感：`VD6282 Rear Light Sensor`（STMicro，`com.google.sensor.rear_light` 类型，连续采样模式，非唤醒）。
  - 距离感应器：`TMD3719 Proximity (wake-up)`。
  - 完备支持上游 `ambient_guard` 前后光感冲突防护与交叉校验。
- 主屏亮度标定：取自系统显示服务诊断与 `/vendor/etc/displayconfig/display_id_4619827677550801152.xml`，分段线性锚点为 2.0 nits（背光 0.0）、600.0 nits（背光 0.6 手动上限）、1000.0 nits（背光 1.0 阳光高亮），保存为 `module/profiles/cheetah.profile`。
- 桥接层按屏幕几何尺寸（横竖屏 1080 × 2340 / 2340 × 1080 与 1440 × 3120 / 3120 × 1440）自动识别并加载 `cheetah.profile`。
- 温控采集支持 `thermal_zone15`（battery）与 `thermal_zone8`（`quiet_therm`，机身表面测温）。

## 控制与学习

桥接通过 SettingsProvider 的 root 外部客户端接口读取模式，通过 Android 显示服务读取当前亮度、系统亮度上限与应用覆盖状态，并使用临时亮度请求。退出、灭屏、手动模式、HDR 或应用覆盖时清除临时请求，不改写用户的自动亮度开关。

用户学习依赖系统 BrightnessTracker 生成的 BrightnessChangeEvent，按时间、当前用户、主屏 ID、照度样本时效/稳定性以及色彩/省电修正过滤。`isUserSetBrightness` 表示短期模型状态，不能单独当作“用户刚刚拖动”的标志；不会仅因系统亮度设置变化而学习。稳定性检查会将前一照度值延续到下一次变化，允许最近 15 秒内的稳定单条记录（包含 0 lux）；仍拒绝过期、无序、异常或近期突变的数据。

当前桥接由 root 进程执行。若 ROM 不向它提供其他用户的事件，其他用户仍隔离存储且不误学习用户 0 的记录；不能把此限制当作多用户真机验收通过。

按变化上报的光感（如 Y700 的 `stk_stk3a5x`）在读数稳定时沿用已有值，不周期性注销和重注册；连续上报型传感器长时间无事件时才尝试恢复。唤醒后等待 2 秒再接管，同时要求主屏开启且系统处于交互状态，避免把息屏显示脉冲当作正常亮屏。针对无后置光感的平板设备，桥接层标记 `back_sensor: "unavailable"` 并将 `back_lux` 置为 -1，核心算法完全由主光感独立驱动，跳过强光突增双光感交叉校验要求。

机身温度采集支持电池温度（battery）及机身表面温控区域（`quiet_therm` / `user_temp` / `front_temp` / `back_temp` / `skin` / `shell`）。温度不可用或过高时禁止额外强光增强，始终服从系统亮度上限。

## 开发测试与回退

开发构建先在独立的临时目录中以 `--observe` 运行，此模式记录事件和学习但不修改显示亮度。主动控制测试需要停止旧模块及其监督服务，避免原版继续写背光。设备重启前不应将临时调试进程视为已安装的开机模块。

安装 v7 后通过 KernelSU 重启切换旧服务。模块卸载保留 `/data/adb/ios_auto_brightness/` 中的学习和配置，WebUI 可明确清除学习。需要完全清理时，先停止/卸载模块，再由用户删除该目录。
