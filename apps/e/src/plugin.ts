import { createPluginRegistry } from "@ventostack/core";

const registry = createPluginRegistry();

// 注册插件清单
registry.register({
  name: "my-plugin",
  version: "1.0.0",
  description: "示例插件",
  keywords: ["example"],
});

// 查询
console.log(registry.has("my-plugin")); // true
console.log(registry.get("my-plugin")); // { manifest, installedAt }
console.log(registry.search("example")); // 按关键词搜索

// 注销
registry.unregister("my-plugin");
console.log(registry.list());           // 所有已注册条目