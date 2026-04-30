/**
 * @ventostack/auth - OAuth2/OIDC 客户端
 * 支持标准 OAuth2 授权码流程，state 参数防 CSRF，exchangeCode 用 POST 换取 token
 * 内置 GitHub 与 Google 提供商预设配置
 */

/**
 * OAuth2 提供商配置
 */
export interface OAuthProvider {
  /** 提供商名称 */
  name: string;
  /** 授权端点 URL */
  authorizationURL: string;
  /** Token 端点 URL */
  tokenURL: string;
  /** 用户信息端点 URL（可选） */
  userInfoURL?: string;
  /** 客户端 ID */
  clientId: string;
  /** 客户端密钥 */
  clientSecret: string;
  /** 请求的权限范围 */
  scopes: string[];
  /** 回调地址 */
  redirectURL: string;
}

/**
 * OAuth2 Token 响应数据
 */
export interface OAuthTokenResponse {
  /** 访问令牌 */
  accessToken: string;
  /** 令牌类型（如 bearer） */
  tokenType: string;
  /** 过期时间（秒） */
  expiresIn?: number;
  /** 刷新令牌 */
  refreshToken?: string;
  /** 授权的权限范围 */
  scope?: string;
  /** ID Token（OIDC） */
  idToken?: string;
}

/**
 * OAuth2 用户信息
 */
export interface OAuthUserInfo {
  /** 用户在提供商处的唯一标识 */
  id: string;
  /** 用户邮箱 */
  email?: string;
  /** 用户姓名 */
  name?: string;
  /** 用户头像 URL */
  avatar?: string;
  /** 原始响应数据 */
  raw: Record<string, unknown>;
}

/**
 * OAuth2 管理器接口
 * 提供授权 URL 生成、Code 换 Token、获取用户信息及常用提供商预设
 */
export interface OAuthManager {
  /**
   * 生成授权 URL
   * @param provider OAuth 提供商配置
   * @param state 防 CSRF 的 state 参数
   * @returns 完整的授权跳转 URL
   */
  getAuthorizationURL(provider: OAuthProvider, state: string): string;

  /**
   * 用授权码换取访问令牌
   * @param provider OAuth 提供商配置
   * @param code 授权码
   * @returns Token 响应数据
   */
  exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthTokenResponse>;

  /**
   * 获取用户信息
   * @param provider OAuth 提供商配置（需配置 userInfoURL）
   * @param accessToken 访问令牌
   * @returns 用户信息
   */
  getUserInfo(provider: OAuthProvider, accessToken: string): Promise<OAuthUserInfo>;

  /**
   * 创建 GitHub OAuth 提供商配置
   * @param config 客户端配置
   * @returns GitHub 提供商配置
   */
  github(config: {
    clientId: string;
    clientSecret: string;
    redirectURL: string;
  }): OAuthProvider;

  /**
   * 创建 Google OAuth 提供商配置
   * @param config 客户端配置
   * @returns Google 提供商配置
   */
  google(config: {
    clientId: string;
    clientSecret: string;
    redirectURL: string;
  }): OAuthProvider;
}

/**
 * 创建 OAuth2 管理器实例
 * @returns OAuth 管理器实例
 */
export function createOAuth(): OAuthManager {
  return {
    getAuthorizationURL(provider: OAuthProvider, state: string): string {
      const url = new URL(provider.authorizationURL);
      url.searchParams.set("client_id", provider.clientId);
      url.searchParams.set("redirect_uri", provider.redirectURL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      if (provider.scopes.length > 0) {
        url.searchParams.set("scope", provider.scopes.join(" "));
      }
      return url.toString();
    },

    async exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthTokenResponse> {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: provider.redirectURL,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      });

      const response = await fetch(provider.tokenURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`OAuth token exchange failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      const token: OAuthTokenResponse = {
        accessToken: data.access_token as string,
        tokenType: (data.token_type as string) ?? "bearer",
      };
      if (data.expires_in) token.expiresIn = data.expires_in as number;
      if (data.refresh_token) token.refreshToken = data.refresh_token as string;
      if (data.scope) token.scope = data.scope as string;
      if (data.id_token) token.idToken = data.id_token as string;
      return token;
    },

    async getUserInfo(provider: OAuthProvider, accessToken: string): Promise<OAuthUserInfo> {
      if (!provider.userInfoURL) {
        throw new Error(`Provider ${provider.name} does not have a userInfoURL configured`);
      }

      const response = await fetch(provider.userInfoURL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `OAuth user info request failed: ${response.status} ${response.statusText}`,
        );
      }

      const raw = (await response.json()) as Record<string, unknown>;

      const user: OAuthUserInfo = { id: String(raw.id ?? raw.sub ?? ""), raw };
      if (raw.email) user.email = raw.email as string;
      if (raw.name ?? raw.login) user.name = (raw.name ?? raw.login) as string;
      if (raw.avatar_url ?? raw.picture) user.avatar = (raw.avatar_url ?? raw.picture) as string;
      return user;
    },

    github(config) {
      return {
        name: "github",
        authorizationURL: "https://github.com/login/oauth/authorize",
        tokenURL: "https://github.com/login/oauth/access_token",
        userInfoURL: "https://api.github.com/user",
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: ["read:user", "user:email"],
        redirectURL: config.redirectURL,
      };
    },

    google(config) {
      return {
        name: "google",
        authorizationURL: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenURL: "https://oauth2.googleapis.com/token",
        userInfoURL: "https://www.googleapis.com/oauth2/v3/userinfo",
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: ["openid", "email", "profile"],
        redirectURL: config.redirectURL,
      };
    },
  };
}
