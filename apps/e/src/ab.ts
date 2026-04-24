import { createABTestManager } from "@ventostack/core";
import type { ABTest } from "@ventostack/core";

const ab = createABTestManager();

// 定义 A/B 测试
ab.define({
  name: "checkout-button-color",
  enabled: true,
  variants: [
    { name: "control", weight: 80 },   // 50% 用户看旧版
    { name: "treatment", weight: 20 }, // 50% 用户看新版
  ],
  sticky: true, // 同一用户始终看到相同变体
});

// 暂停测试
ab.disable("checkout-button-color");

// // 恢复测试
// ab.enable("checkout-button-color");

// 查看所有测试
// const allTests = ab.list();

// console.log(allTests)

// 根据用户 ID 分配（粘性，同用户总是相同结果）
const result = ab.assign("checkout-button-color", 'aaa1231');

if (result?.variant === "treatment") {
  // 新版按钮
  console.log('new')
} else {
  // 旧版按钮
  console.log('old')
}

// 匿名用户（随机分配）
const anonResult = ab.assign("checkout-button-color");
console.log(anonResult)