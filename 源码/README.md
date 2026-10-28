# ADC 牙科连锁诊所管理系统

安德鲁牙科连锁（Andrew's Dental Chain, ADC）内部 Web 管理系统，覆盖患者、预约、排班、牙医资质、就诊治疗、结算、成本审核和季度绩效的完整业务闭环。

> 本项目仅供 ADC 总部及旗下诊所内部授权人员使用，不是患者自助平台。

## 界面预览

| 登录 | 经营概览 |
|---|---|
| ![登录](docs/screenshots/login.png) | ![经营概览](docs/screenshots/dashboard.png) |
| 患者档案 | 季度绩效 |
| ![患者档案](docs/screenshots/patients.png) | ![季度绩效](docs/screenshots/performance.png) |

## 技术栈

- 前端：React 18、React Router、Vite 4、原生响应式 CSS
- 后端：Node.js 16.20+、Express 4、Zod 校验
- 数据库：MySQL 8.0（已按现有结构验证 MySQL 8.0.44）
- 认证：JWT HttpOnly Cookie + bcrypt 密码哈希
- 测试：Vitest、Supertest、真实 MySQL 测试库、Puppeteer Core 页面冒烟测试

项目实际使用现有数据库结构：**22 张实体表 + 1 个派生绩效视图**。任务书中的“21 张实体表”与实际 SQL 不一致，代码以仓库现有 SQL 为准，没有删除、重命名或重构现有表。

## 目录

```text
sql/01_schema.sql             权威数据库结构
report/                       需求与数据库设计资料
src/server/                   Express API、业务服务、种子与测试脚本
src/web/                      React 管理端
src/server/__tests__/         数据库集成测试
docs/screenshots/             页面验证截图
docs/requirements-traceability.md  UC001–UC012 追踪表
```

## 本机启动

### 1. 环境要求

- Node.js >= 16.20（本项目已在 Node 16.20.2 实际构建和运行）
- MySQL 8.0
- 可选的 Chrome/Edge，用于页面冒烟测试

### 2. 初始化数据库

先按现有环境执行：

```bash
mysql -h 127.0.0.1 -P 3307 -u root -p < sql/01_schema.sql
```

为应用创建独立账号。以下示例密码仅用于本地开发，请自行替换：

```sql
CREATE USER 'dental_app'@'127.0.0.1' IDENTIFIED BY 'YourLocalPassword';
CREATE USER 'dental_app'@'localhost' IDENTIFIED BY 'YourLocalPassword';
GRANT ALL PRIVILEGES ON dental_clinic_db.* TO 'dental_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON dental_clinic_db.* TO 'dental_app'@'localhost';
GRANT ALL PRIVILEGES ON dental_clinic_test.* TO 'dental_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON dental_clinic_test.* TO 'dental_app'@'localhost';
FLUSH PRIVILEGES;
```

### 3. 配置环境变量

```bash
# Windows PowerShell
Copy-Item .env.example .env
# Linux/macOS
cp .env.example .env
```

编辑 `.env`：

```env
PORT=3000
JWT_SECRET=请替换为足够长的随机字符串
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=dental_app
DB_PASSWORD=你的本地数据库密码
DB_DATABASE=dental_clinic_db
DEFAULT_DENTIST_PASSWORD=新建牙医时的初始密码
DEMO_PASSWORD=Dental@2026
```

`.env` 已加入 `.gitignore`，不会提交真实凭据。

### 4. 安装、写入演示数据、构建与启动

```bash
npm install
npm run db:seed
npm run build
npm start
```

访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

开发模式：

```bash
npm run dev
```

- API：http://127.0.0.1:3000
- Vite：http://127.0.0.1:5173

## 演示账号

演示账号仅在执行 `npm run db:seed` 后存在。种子脚本检测到 `user_account` 已有数据时会停止写入，不会清空现有数据库。

| 用户名 | 角色 | 授权范围 |
|---|---|---|
| `hqadmin` | 总部管理人员 | 全部门店 |
| `frontdesk` | 前台人员 | 天河、越秀 |
| `manager1` | 诊所主管 | 天河 |
| `manager2` | 诊所主管 | 越秀 |
| `dentist1` | 牙医 | 张明，跨店出诊 |
| `dentist2` | 牙医 | 李悦，跨店出诊 |
| `dentist3` | 牙医 | 王浩，跨店出诊 |
| `dentist4` | 牙医 | 周宁，跨店出诊 |
| `patient1` | 患者 | 林可，患者自助端 |

统一演示密码：`Dental@2026`

## 权限概览

| 能力 | 前台 | 牙医 | 诊所主管 | 总部 |
|---|---|---|---|---|
| 患者档案维护 | 是 | 只读 | 是 | 是 |
| 预约/到诊/改期/取消 | 是 | 只读本人 | 是 | 是 |
| 排班与跨店出诊 | 只读 | 只读本人 | 本店范围 | 全部 |
| 就诊与治疗记录 | 只读 | 维护本人 | 本店范围 | 全部 |
| 结算生成/作废 | 是 | 只读 | 是 | 是 |
| 成本录入/审核 | 否 | 否 | 本店范围 | 全部 |
| 季度绩效 | 否 | 本人 | 本店范围 | 全部 |
| 审计日志 | 否 | 否 | 否 | 全部 |

后端对接口执行权限和诊所范围校验，不能仅靠隐藏前端按钮绕过。

## 核心业务规则

- 预约区间采用 `[start, end)`，首尾相接合法；同一牙医的时间重叠被拒绝。
- 预约必须落在已发布排班内，并满足排班所需且已核验的资质。
- 改期在同一个事务内完成校验与新预约创建；失败时原预约和原时段保持不变。
- 跨店出诊检查牙医在全部诊所的时间冲突；有有效预约的排班不能直接取消或缩短。
- 治疗明细保存记录时点的标准单价快照；有效结算后不能追加或作废治疗明细。
- 同一就诊最多一张 `ACTIVE` 结算单；作废后保留历史版本，重新生成使用新版本号。
- 绩效收入只统计 `ACTIVE` 结算；存在草稿成本、成本类别缺失或季度末未结算就诊时，净利润返回 `NULL`。
- 绩效列表直接读取 `v_quarterly_dentist_performance`，不修改既有视图定义。
- 成本审核将 `cost_entry_no` 写入审计日志 `entity_id`，与既有绩效视图的成本事件口径一致。
- 所有时间存 UTC；界面与季度边界按 `Asia/Shanghai` 展示和计算。

## 测试

### 后端集成测试

```bash
npm test
```

该命令会：

1. 删除并重建 **仅限** `dental_clinic_test` 测试库；
2. 使用 `sql/01_schema.sql` 创建结构；
3. 运行 23 个真实 MySQL 集成测试。

已覆盖：患者档案与历史、预约冲突/首尾相接、未发布排班与发布后可用、超出排班范围、无效资质、改期成功关联、改期失败回滚、跨店冲突、结算快照与重复结算、结算作废、成本缺失/零成本/草稿/驳回、DRAFT 阻止净利润、季度末未结算、绩效快照确认与更正版本、角色与诊所越权，以及患者注册/绑定、预约金支付、提前取消退款、超时释放、患者越权、员工预约免预约金、退款驳回不没收、诊所取消退款、结算作废人工异常、线下收款登记/确认等患者端场景。

最近一次执行结果：**23/23 通过**。

### 页面冒烟测试

先保持应用运行，再执行：

```bash
npm run test:ui
```

默认使用 `C:\Program Files\Google\Chrome\Application\chrome.exe`。可通过 `CHROME_PATH` 指定其他 Chrome/Edge 可执行文件。

测试会登录系统并依次打开登录、概览、患者、预约、排班、牙医、诊所、治疗项目、就诊、结算、成本、绩效、历史查询和审计页面，同时保存截图到 `artifacts/ui-smoke/`。

最近一次执行结果：**通过，无页面脚本错误或 5xx 响应**。

### 构建

```bash
npm run build
```

最近一次构建：Vite 生产构建成功。

## 微信小程序（云开发）

- 目录：`wechat-miniprogram/`
- AppID：`wxd8156d8804b96d6a`
- 云环境：`cloud1-d5gcycdmec1eb570f`
- 云函数：`api`（已部署）
- 定位：**仅患者端**；员工端已移出小程序，统一使用本仓库的 Web 管理后台
- 使用说明：[wechat-miniprogram/README.md](wechat-miniprogram/README.md)
- 体验版二维码见课程报告第 8 章
- 小程序云数据库与 Web 端 MySQL 当前为独立数据域，未自动同步；员工 Web 端操作仍以 MySQL 为准

## 品牌图标

- 源文件：`artifacts/branding/adc-app-icon.svg`
- 1024 导出：`artifacts/branding/adc-app-icon.png`
- Web 图标：`src/web/public/favicon.svg`、`favicon.ico`、`favicon-32.png`、`app-icon-192.png`、`app-icon-512.png`、`apple-touch-icon.png`
- 登录页、员工侧边栏和患者端侧边栏使用同一图标。

## 患者端（增量）

项目在同一 React/Express/MySQL 应用中增加了患者自助端，入口仍为统一登录页。

- 患者注册后默认创建新患者档案；已有档案可选择“申请绑定”，由前台/主管/总部按诊所范围审核。
- 患者端路由：`/portal`、`/portal/booking`、`/portal/appointments`、`/portal/payments`、`/portal/refunds`、`/portal/visits`、`/portal/charges`、`/portal/notifications`、`/portal/profile`。
- 患者自助预约生成 `PENDING_PAYMENT` 预约和 15 分钟预约金订单；支付成功后转为 `SCHEDULED`，超时关闭并释放时段。
- 支付/退款使用明确标识的模拟适配器，不代表真实资金到账。
- 员工普通创建预约仍不收取预约金；员工端新增患者绑定审核、退款审核、患者支付订单、结算资金异常页面。
- 数据库增量迁移：`npm run db:migrate`（仅对非 `_test` 库执行一次；已有 `patient_account` 会跳过）。
- 测试仍使用隔离的 `dental_clinic_test`：`npm test` 会重建测试库，禁止对业务库执行。

## 主要 API

| 模块 | 路径 |
|---|---|
| 登录/会话 | `POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout` |
| 患者 | `GET/POST /api/patients`、`GET/PUT /api/patients/:id`、过敏子资源 |
| 预约 | `GET/POST /api/appointments`、`cancel`、`reschedule`、`attend`、`no-show` |
| 可用时段 | `GET /api/availability` |
| 排班 | `GET/POST /api/schedules`、`publish`、`cancel` |
| 牙医/资质 | `GET/POST /api/dentists`、资质子资源、`/api/catalog/qualifications` |
| 诊所 | `GET/POST /api/clinics`、`PUT /api/clinics/:id` |
| 治疗与价格 | `/api/catalog/treatments`、价格草稿/批准/驳回 |
| 就诊与治疗 | `GET/PUT /api/visits/:id`、治疗追加/作废 |
| 结算 | `GET /api/settlements`、`POST /api/settlements/visits/:visitId`、`POST /api/settlements/:id/void` |
| 成本 | `GET/POST /api/costs`、`verify`、`reject` |
| 绩效 | `GET /api/performance`、`export`、`confirm` |
| 审计 | `GET /api/audit` |
| 患者认证 | `POST /api/auth/register`、`GET /api/auth/me` |
| 患者预约 | `POST/GET /api/patient/appointments`、`POST /api/patient/appointments/:id/cancel` |
| 患者支付 | `GET /api/patient/payment-orders`、`POST /api/patient/payment-orders/:id/pay` |
| 患者记录 | `GET /api/patient/visits`、`/api/patient/settlements`、`/api/patient/refunds` |
| 患者通知 | `GET /api/patient/notifications`、`POST /api/patient/notifications/:id/read` |
| 员工患者协同 | `/api/staff/patient-bindings`、`/api/staff/payment-orders`、`/api/staff/refunds`、`/api/staff/settlement-exceptions` |

## 课程报告与 GitHub 交付

- 最终报告 PDF：`../报告/1602240208信管2402刘鑫.pdf`
- 可编辑 LaTeX 源文件：`docs/final-report/source/main.tex`
- 报告图表源文件：`docs/final-report/source/diagrams/`
- 数据库 ERD 源文件：`docs/erd/dental_clinic_erd.drawio`
- GitHub 上传说明：`GITHUB_UPLOAD.md`

## 已知限制与未纳入范围

- 系统不包含患者自助预约、医保/商业保险、库存、PACS/影像、AI 诊断、营销会员、总账与税务，均在原需求范围之外。
- 当前未提供前台/诊所主管账号管理界面；演示账号由种子脚本创建，生产部署应按组织制度单独配置账号。
- 认证具备服务端角色与范围校验，但未实现 MFA、登录限流、密码找回和集中 SSO；生产环境应通过 HTTPS、反向代理和运维策略补齐。
- 已确认绩效快照的更正接口会生成新版本并保留完整版本链；由于既有视图优先返回正式快照，更正版本当前复用视图显示的已确认口径，不自动重算快照之后新增的底层业务数据。涉及跨期补录时应先按制度复核并记录更正原因。
- 未集成邮件、短信或支付渠道。
- `npm audit --omit=dev` 报告 2 个 moderate 级 React Router 6 漏洞；修复需要升级到 React Router 7 与 Node 20+，本次测试环境为 Node 16，未执行破坏性升级。

完整执行结果见 `docs/test-report.md`。
- UI 冒烟测试依赖本机 Chrome，不包含逐页面的按钮级端到端覆盖；核心写操作由后端集成测试验证。
