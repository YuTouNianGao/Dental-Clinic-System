# Database Artifacts

本目录保存可随项目提交的数据库说明和备份，不保存 MySQL 运行时二进制数据文件。

## 数据库环境

- MySQL Server：8.0.44
- 字符集：`utf8mb4`
- 排序规则：`utf8mb4_0900_ai_ci`
- 数据库：`dental_clinic_db`
- 本地监听：`127.0.0.1:3307`

## 文件

- `backup/dental_clinic_db.sql`：使用 `mysqldump` 生成的数据库备份快照。
- `backup_database.ps1`：重新生成上述备份的脚本。

## 重要说明

1. 系统运行时实际修改的是 MySQL 服务器中的 `dental_clinic_db`，不是仓库中的 SQL 文件。
2. `01_schema.sql` 用于创建数据库结构。
3. `backup/dental_clinic_db.sql` 是某一时刻的快照，不会随着系统运行自动更新。
4. 系统加入或修改业务数据后，如要提交最新数据，应先重新执行备份脚本。
5. 实时 InnoDB 数据目录位于 `database/mysql-data/`。6. `database/mysql-data/` 已加入 `.gitignore`，不要直接提交实时二进制数据文件。

