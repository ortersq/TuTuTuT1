@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title 一键 Git 提交推送

REM ================= 报告相关变量 =================
set "REPORT=git-push-report.txt"
set "START=%date% %time%"
set "STATUS=未知"
set "STEP_ADD=未执行"
set "STEP_COMMIT=未执行"
set "STEP_PULL=未执行"
set "STEP_PUSH=未执行"
set "BRANCH=未知"
set "MSG="
set "ERRMSG="
set "COMMIT_HASH="

echo ==========================================
echo        一键 Git 提交推送脚本
echo ==========================================
echo.

REM ========== 1. 检查是否在 Git 仓库中 ==========
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    set "STATUS=失败"
    set "ERRMSG=当前目录不是 Git 仓库"
    set "STEP_ADD=跳过"
    goto :report
)
set "STEP_ADD=仓库检查通过"

REM ========== 2. 获取提交信息 ==========
set "MSG=%~1"
if "%MSG%"=="" (
    set /p "MSG=请输入提交说明（直接回车用默认 update）: "
    if "!MSG!"=="" set "MSG=update"
)

REM ========== 3. 暂存改动 ==========
echo.
echo [执行] git add -A
git add -A
if errorlevel 1 (
    set "STATUS=失败"
    set "ERRMSG=git add 执行失败"
    goto :report
)
set "STEP_ADD=成功"

REM ========== 4. 判断是否有改动 ==========
git diff --cached --quiet
if not errorlevel 1 (
    set "STEP_COMMIT=无改动，跳过"
    goto :check_remote
)

echo [执行] git commit -m "%MSG%"
git commit -m "%MSG%" >temp_commit.log 2>&1
if errorlevel 1 (
    set "STEP_COMMIT=失败"
    set "STATUS=失败"
    set "ERRMSG=git commit 失败（可能未配置 user.name/user.email）"
    type temp_commit.log
    del temp_commit.log >nul 2>&1
    goto :report
)
for /f "tokens=1" %%h in ('git rev-parse --short HEAD') do set "COMMIT_HASH=%%h"
set "STEP_COMMIT=成功 (commit !COMMIT_HASH!)"
del temp_commit.log >nul 2>&1

:check_remote
REM ========== 5. 检查远程仓库 ==========
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    set "STATUS=失败"
    set "ERRMSG=未配置远程仓库 origin"
    goto :report
)

REM ========== 6. 获取当前分支 ==========
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
if "%BRANCH%"=="HEAD" (
    set "STATUS=失败"
    set "ERRMSG=当前处于游离 HEAD 状态，无法推送"
    goto :report
)
echo.
echo [信息] 当前分支：%BRANCH%

REM ========== 7. 拉取远程更新 ==========
echo [执行] git pull --rebase origin %BRANCH%
git pull --rebase origin %BRANCH% >temp_pull.log 2>&1
if errorlevel 1 (
    set "STEP_PULL=失败"
    set "STATUS=失败"
    set "ERRMSG=git pull --rebase 失败或存在冲突"
    echo ---- pull 输出 ----
    type temp_pull.log
    echo -------------------
    del temp_pull.log >nul 2>&1
    goto :report
)
set "STEP_PULL=成功"
del temp_pull.log >nul 2>&1

REM ========== 8. 推送 ==========
echo [执行] git push origin %BRANCH%
git push origin %BRANCH% >temp_push.log 2>&1
if errorlevel 1 (
    set "STEP_PUSH=失败"
    set "STATUS=失败"
    set "ERRMSG=git push 失败（认证/权限/远程更新等）"
    echo ---- push 输出 ----
    type temp_push.log
    echo -------------------
    del temp_push.log >nul 2>&1
    goto :report
)
set "STEP_PUSH=成功"
set "STATUS=成功"
del temp_push.log >nul 2>&1

:report
REM ================= 输出并保存报告 =================
set "END=%date% %time%"

echo.
echo ==========================================
echo              运行报告
echo ==========================================
echo 开始时间 : %START%
echo 结束时间 : %END%
echo 提交说明 : %MSG%
echo 当前分支 : %BRANCH%
echo ------------------------------------------
echo 仓库检查 : %STEP_ADD%
echo 提交     : %STEP_COMMIT%
echo 拉取     : %STEP_PULL%
echo 推送     : %STEP_PUSH%
echo ------------------------------------------
echo 最终状态 : %STATUS%
if not "%ERRMSG%"=="" echo 错误信息 : %ERRMSG%
echo ==========================================

(
echo ========== Git 推送运行报告 ==========
echo 开始时间 : %START%
echo 结束时间 : %END%
echo 提交说明 : %MSG%
echo 当前分支 : %BRANCH%
echo --------------------------------------
echo 仓库检查 : %STEP_ADD%
echo 提交     : %STEP_COMMIT%
echo 拉取     : %STEP_PULL%
echo 推送     : %STEP_PUSH%
echo --------------------------------------
echo 最终状态 : %STATUS%
if not "%ERRMSG%"=="" echo 错误信息 : %ERRMSG%
echo ======================================
) > "%REPORT%"

echo.
echo 报告已保存到：%CD%\%REPORT%
echo.
echo 窗口不会自动关闭，看完请手动关闭。
echo.
pause
endlocal
exit /b