# 贡献指南

[English](CONTRIBUTING.md) | 简体中文

感谢你有兴趣参与贡献！以下是参与方式。

## 报告 Bug

在 [Issues](https://github.com/liuzeming-yuxi/Openclaw-Connector/issues) 中提交，请包含：

- 复现步骤
- 期望行为 vs 实际行为
- macOS 版本和应用版本

## 功能建议

在 Issues 中提交，添加 `enhancement` 标签，描述：

- 你想解决的问题
- 你建议的方案

## 开发环境搭建

```bash
# 前置要求：Node.js 18+、pnpm、Rust 工具链

git clone https://github.com/liuzeming-yuxi/Openclaw-Connector.git
cd Openclaw-Connector
pnpm install
pnpm tauri dev
```

## 提交 Pull Request

1. Fork 仓库，从 `main` 创建分支
2. 完成修改
3. 提交前运行测试：
   ```bash
   pnpm test
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
4. 写清楚 PR 描述，说明改了什么以及为什么

## 代码规范

- **TypeScript**：遵循项目现有风格，使用严格类型
- **Rust**：提交前运行 `cargo fmt` 和 `cargo clippy`
- **提交信息**：使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范（`feat:`、`fix:`、`docs:` 等）

## 许可证

参与贡献即表示你同意你的贡献将按照 [MIT 许可证](LICENSE) 发布。
