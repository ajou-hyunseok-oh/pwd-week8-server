import type { RequestHandler } from "express";
import { getSupabase, throwDatabaseError } from "../config/supabase";
import { profileResponse } from "../types/auth.types";
import HttpError from "../utils/httpError";
import asyncHandler from "../utils/asyncHandler";

export const isAuthenticated = asyncHandler(async (req, _res, next) => {
  const match = req.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new HttpError(401, "로그인이 필요합니다.");
  const db = getSupabase();
  const { data, error } = await db.auth.getUser(match[1]);
  if (error) {
    if (!error.status || error.status >= 500)
      throw new HttpError(503, "인증 서버에 연결할 수 없습니다.");
    throw new HttpError(401, "로그인이 만료되었거나 유효하지 않습니다.");
  }
  if (!data.user) throw new HttpError(401, "로그인이 필요합니다.");
  const result = await db
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();
  if (result.error) throwDatabaseError(result.error);
  if (!result.data)
    throw new HttpError(
      403,
      "사용자 프로필이 없습니다. Supabase 스키마 설정을 확인하세요.",
    );
  if (!result.data.is_active)
    throw new HttpError(403, "비활성화된 계정입니다.");
  req.auth = profileResponse(result.data);
  next();
});
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.auth?.userType !== "admin")
    return next(new HttpError(403, "관리자 권한이 필요합니다."));
  next();
};
