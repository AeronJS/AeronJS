// @ventostack/core - 中间件系统（洋葱模型）

import type { Context } from "./context";

/** 下一个中间件或处理器的调用函数 */
export type NextFunction = () => Promise<Response>;
/** 中间件函数类型 */
export type Middleware = (ctx: Context, next: NextFunction) => Promise<Response>;

/**
 * 组合中间件为洋葱模型执行链。
 * 每个中间件中 next() 只允许调用一次，重复调用抛错。
 * @param middlewares - 中间件数组
 * @returns 组合后的执行函数
 */
export function compose(
  middlewares: Middleware[],
): (ctx: Context, finalHandler: NextFunction) => Promise<Response> {
  return (ctx: Context, finalHandler: NextFunction): Promise<Response> => {
    let index = -1;

    function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;

      if (i === middlewares.length) {
        return finalHandler();
      }

      const middleware = middlewares[i]!;
      return middleware(ctx, () => dispatch(i + 1));
    }

    return dispatch(0);
  };
}
