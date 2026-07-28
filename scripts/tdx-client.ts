const TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";
const API_ROOT = "https://tdx.transportdata.tw/api/basic";

interface TdxClientOptions {
    clientId: string;
    clientSecret: string;
    fetchImpl?: typeof fetch;
}

interface TokenResponse {
    access_token?: string;
    expires_in?: number;
}

export interface TdxClient {
    getJson(path: string): Promise<unknown>;
}

export function createTdxClient(options: TdxClientOptions): TdxClient {
    const fetchImpl = options.fetchImpl ?? fetch;
    let token: { value: string; expiresAt: number } | null = null;

    const accessToken = async (): Promise<string> => {
        if (token && token.expiresAt > Date.now() + 60_000) {
            return token.value;
        }
        const body = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: options.clientId,
            client_secret: options.clientSecret,
        });
        const response = await fetchImpl(TOKEN_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
        });
        if (!response.ok) {
            throw new Error(`TDX 身分驗證失敗（HTTP ${response.status}）`);
        }
        const payload = await response.json() as TokenResponse;
        if (!payload.access_token) {
            throw new Error("TDX 身分驗證未回傳 Access Token");
        }
        token = {
            value: payload.access_token,
            expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
        };
        return token.value;
    };

    return {
        async getJson(path: string): Promise<unknown> {
            const response = await fetchImpl(`${API_ROOT}${path}`, {
                headers: {
                    authorization: `Bearer ${await accessToken()}`,
                    "accept-encoding": "br, gzip",
                },
            });
            if (!response.ok) {
                throw new Error(`TDX 資料取得失敗（HTTP ${response.status}，${path.split("?")[0]}）`);
            }
            return response.json() as Promise<unknown>;
        },
    };
}
