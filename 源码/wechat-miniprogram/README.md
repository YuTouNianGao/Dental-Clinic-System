# ADC 牙科连锁 · 微信小程序（云开发）

这是现有 ADC 牙科诊所系统的微信小程序版本，使用原生小程序 + 微信云开发（云函数 + 云数据库）。

## 项目信息

- AppID：`wxd8156d8804b96d6a`
- 云环境：`cloud1-d5gcycdmec1eb570f`
- 小程序根目录：`miniprogram/`
- 云函数根目录：`cloudfunctions/`
- 云函数：`api`
- 项目入口：本目录 `wechat-miniprogram/`

## 登录方式

本小程序**仅面向患者**。员工端已移出小程序，统一通过电脑浏览器访问 Web 管理后台。

患者使用系统分配的患者账号 + 自设密码登录；没有账号可直接注册。注册需填写姓名、性别、年龄、手机号并设置密码，系统自动分配账号。

## 打开方式

### 方式一：微信开发者工具导入

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 目录选择：

   ```text
   D:\GitHub\Dental-Clinic-System\Dental-Clinic-System\wechat-miniprogram
   ```

4. AppID 使用 `wxd8156d8804b96d6a`。
5. 确认云开发环境为 `cloud1-d5gcycdmec1eb570f`。
6. 编译。

### 方式二：命令行打开

```bash
"D:\Wechat\微信web开发者工具\cli.bat" open --project "D:\GitHub\Dental-Clinic-System\Dental-Clinic-System\wechat-miniprogram"
```

## 云函数部署

```bash
"D:\Wechat\微信web开发者工具\cli.bat" cloud functions deploy ^
  --env cloud1-d5gcycdmec1eb570f ^
  --names api ^
  --project "D:\GitHub\Dental-Clinic-System\Dental-Clinic-System\wechat-miniprogram" ^
  --remote-npm-install
```

## 首次运行与演示数据

页面首次调用 `bootstrap` 时只检查登录会话，不会一次写入全量演示数据，避免云函数默认 3 秒超时。

演示数据按需初始化：

- 打开预约页时初始化 4 家诊所、5 个科室；
- 选择诊所后初始化该诊所的 6 名医生和 6 张牙椅；
- 打开患者档案/绑定页时初始化 8 位示范患者和部分就诊记录。

建议在云开发控制台把 `api` 云函数超时时间调到 **20 秒**（默认 3 秒）；当前代码已按 3 秒限制拆分初始化，但生产环境仍建议 20 秒。

### 患者身份

患者不使用微信临时身份，必须：

1. 打开小程序，进入患者登录页；
2. 注册患者账号，填写姓名、性别、年龄、手机号并设置密码；
3. 系统分配患者账号（如 `P12345678`）；
4. 使用该账号和密码登录。

每个患者账号对应独立的患者档案，只能查看自己的预约、就诊和账单。

## 已实现页面

### 患者端

- 首页：问候、快捷入口、待支付、最近预约、近期就诊
- 预约：诊所 → 科室 → 医生 → 7 天日期条/可用时段 → 就诊需求，15 分钟占位
- 我的预约：全部/待支付/已确认/已完成/已取消筛选
- 预约详情：就诊信息、订单、变更记录、支付、取消
- 支付订单：预约金/诊后余额模拟支付
- 退款记录：审核/处理中/成功/失败/驳回
- 就诊与账单：就诊记录、ACTIVE/VOID 结算单
- 档案绑定：姓名+手机号申请绑定既有患者档案
- 站内通知
- 个人资料：联系方式维护

### 员工端

员工端**不在小程序内**。员工通过电脑浏览器访问原 Web 管理后台，继续处理：

- 员工登录、角色权限与诊所范围
- 患者档案、预约、排班、牙椅
- 登记到诊、退款审核、线下收款
- 结算单、成本、季度绩效与审计

小程序底部保留四个患者入口：首页、预约、记录、我的。

## 云数据库集合

```text
meta
clinics
departments
dentists
chairs
schedules
patients
treatments
users
sessions
appointments
appointment_changes
payment_orders
payment_transactions
refunds
visits
settlements
notifications
deposit_applications
staff_requests
binding_requests
```

当前版本金额以“分”为单位存储，显示时转换为元。

## 业务规则

- 患者自助预约才生成预约金订单，预约保留 15 分钟；
- 预约同时校验医生和牙椅时间冲突，系统自动分配空闲牙椅；
- 员工普通创建预约不生成预约金（员工端在 Web 管理后台操作）；
- 提前 24 小时以上患者取消，生成 `PENDING_REVIEW` 退款；
- 不足 24 小时取消，预约金转 `FORFEITED`；
- 诊所取消已支付预约：主管/总部操作，自动生成退款；
- 未到诊：已支付预约金转 `FORFEITED`；
- 退款驳回不会自动没收，订单保持资金状态；
- 余额订单支持线下登记（`RECORDED`），主管确认（`CONFIRMED`）后才冲减欠款；
- 结算状态继续使用 `ACTIVE/VOID` 语义。

## 当前限制

这是云开发版本的首期可运行闭环，不等同于把原 Express/MySQL 全部业务表原样搬迁：

- 云数据库为独立演示库，未自动同步原 MySQL 业务数据；
- 小程序仅覆盖患者端，员工端已移出并回到 Web 管理后台；
- 员工端的 Web 业务数据仍以 MySQL 为准，尚未与小程序云数据库自动同步；
- 支付、退款均为模拟渠道，不接真实微信支付；
- 患者使用“患者账号 + 密码”登录，不再使用微信临时 OPENID；未接入手机号授权和监护人体系；
- 未实现预约/牙椅冲突的数据库级唯一锁；生产环境需要增加云数据库索引、事务和并发压测；
- 未实现微信支付回调、消息订阅、真实退款渠道；
- 当前演示数据为 4 家诊所、24 名医生、24 张牙椅、8 位患者，不代表 ADC 真实门店数据。

## 打包与预览

```bash
"D:\Wechat\微信web开发者工具\cli.bat" preview ^
  --project "D:\GitHub\Dental-Clinic-System\Dental-Clinic-System\wechat-miniprogram" ^
  --qr-format image ^
  --qr-output "D:\GitHub\Dental-Clinic-System\Dental-Clinic-System\wechat-miniprogram\preview-qr.jpg"
```

执行命令后本地生成 `preview-qr.jpg`；该文件属于生成产物，不纳入源码提交。
