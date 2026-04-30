/**
 * @ventostack/auth - 多端登录支持
 * 提供设备数量限制、同类型设备限制与溢出策略（拒绝或踢掉最老）
 * 基于内存 Map 存储用户设备会话，支持活跃状态检测与续期
 */

/**
 * 设备会话数据结构
 */
export interface DeviceSession {
  /** Session 唯一标识 */
  sessionId: string;
  /** 关联用户 ID */
  userId: string;
  /** 设备类型（如 "web", "ios", "android"） */
  deviceType: string;
  /** 设备名称（可选） */
  deviceName?: string;
  /** 登录 IP 地址（可选） */
  ip?: string;
  /** 用户代理字符串（可选） */
  userAgent?: string;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 最后活跃时间戳（毫秒） */
  lastActiveAt: number;
}

/**
 * 多端登录管理配置选项
 */
export interface MultiDeviceOptions {
  /** 每个用户最大设备数，默认 5 */
  maxDevices?: number;
  /** 允许的设备类型列表（用于区分端） */
  deviceTypes?: string[];
  /** 每种设备类型最大数，默认 2 */
  maxPerType?: number;
  /** 超出限制时的策略：reject 表示拒绝登录，kick-oldest 表示踢掉最老的设备，默认 kick-oldest */
  overflowStrategy?: "reject" | "kick-oldest";
}

/**
 * 多端登录管理器接口
 * 提供设备数量限制、溢出策略与设备会话管理能力
 */
export interface MultiDeviceManager {
  /**
   * 用户登录，按设备限制策略处理
   * @param userId 用户 ID
   * @param device 设备信息（不含 createdAt 和 lastActiveAt）
   * @returns 包含 allowed（是否允许）和 kicked（被踢掉的 sessionId 列表）的结果
   */
  login(
    userId: string,
    device: Omit<DeviceSession, "createdAt" | "lastActiveAt">,
  ): Promise<{ allowed: boolean; kicked?: string[] }>;

  /**
   * 注销指定设备会话
   * @param userId 用户 ID
   * @param sessionId 设备 Session ID
   */
  logout(userId: string, sessionId: string): void;

  /**
   * 注销用户的所有设备会话
   * @param userId 用户 ID
   */
  logoutAll(userId: string): void;

  /**
   * 获取用户的所有设备会话
   * @param userId 用户 ID
   * @returns 设备会话列表
   */
  getSessions(userId: string): DeviceSession[];

  /**
   * 获取用户的活跃设备数量
   * @param userId 用户 ID
   * @returns 活跃设备数
   */
  getActiveDeviceCount(userId: string): number;

  /**
   * 更新设备最后活跃时间
   * @param userId 用户 ID
   * @param sessionId 设备 Session ID
   */
  touch(userId: string, sessionId: string): void;

  /**
   * 判断设备会话是否有效
   * @param userId 用户 ID
   * @param sessionId 设备 Session ID
   * @returns 有效返回 true，否则返回 false
   */
  isSessionValid(userId: string, sessionId: string): boolean;
}

/**
 * 创建多端登录管理器实例
 * 基于内存 Map 存储用户设备会话，支持设备数量限制与溢出策略
 * @param options 多端登录配置选项
 * @returns 多端登录管理器实例
 */
export function createMultiDeviceManager(options?: MultiDeviceOptions): MultiDeviceManager {
  const maxDevices = options?.maxDevices ?? 5;
  const maxPerType = options?.maxPerType ?? 2;
  const overflowStrategy = options?.overflowStrategy ?? "kick-oldest";

  // userId -> sessions
  const userSessions = new Map<string, Map<string, DeviceSession>>();

  /**
   * 获取或创建用户的设备会话 Map
   * @param userId 用户 ID
   * @returns 该用户的设备会话 Map
   */
  function getOrCreateUserMap(userId: string): Map<string, DeviceSession> {
    let sessions = userSessions.get(userId);
    if (!sessions) {
      sessions = new Map();
      userSessions.set(userId, sessions);
    }
    return sessions;
  }

  return {
    async login(
      userId: string,
      device: Omit<DeviceSession, "createdAt" | "lastActiveAt">,
    ): Promise<{ allowed: boolean; kicked?: string[] }> {
      const sessions = getOrCreateUserMap(userId);
      const kicked: string[] = [];

      // 检查同设备类型限制
      const sameTypeCount = Array.from(sessions.values()).filter(
        (s) => s.deviceType === device.deviceType,
      ).length;

      if (sameTypeCount >= maxPerType) {
        if (overflowStrategy === "reject") {
          return { allowed: false };
        }
        // kick oldest of same type
        const sameType = Array.from(sessions.values())
          .filter((s) => s.deviceType === device.deviceType)
          .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
        const toKick = sameType.slice(0, sameTypeCount - maxPerType + 1);
        for (const s of toKick) {
          sessions.delete(s.sessionId);
          kicked.push(s.sessionId);
        }
      }

      // 检查总设备数限制
      if (sessions.size >= maxDevices) {
        if (overflowStrategy === "reject") {
          return { allowed: false };
        }
        const all = Array.from(sessions.values()).sort((a, b) => a.lastActiveAt - b.lastActiveAt);
        const toKick = all.slice(0, sessions.size - maxDevices + 1);
        for (const s of toKick) {
          sessions.delete(s.sessionId);
          if (!kicked.includes(s.sessionId)) kicked.push(s.sessionId);
        }
      }

      const now = Date.now();
      sessions.set(device.sessionId, {
        ...device,
        createdAt: now,
        lastActiveAt: now,
      });

      const result: { allowed: true; kicked?: string[] } = { allowed: true };
      if (kicked.length > 0) result.kicked = kicked;
      return result;
    },

    logout(userId: string, sessionId: string): void {
      const sessions = userSessions.get(userId);
      if (sessions) sessions.delete(sessionId);
    },

    logoutAll(userId: string): void {
      userSessions.delete(userId);
    },

    getSessions(userId: string): DeviceSession[] {
      const sessions = userSessions.get(userId);
      if (!sessions) return [];
      return Array.from(sessions.values());
    },

    getActiveDeviceCount(userId: string): number {
      return userSessions.get(userId)?.size ?? 0;
    },

    touch(userId: string, sessionId: string): void {
      const sessions = userSessions.get(userId);
      const session = sessions?.get(sessionId);
      if (session) session.lastActiveAt = Date.now();
    },

    isSessionValid(userId: string, sessionId: string): boolean {
      const sessions = userSessions.get(userId);
      return sessions?.has(sessionId) ?? false;
    },
  };
}
