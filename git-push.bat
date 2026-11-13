@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ==========================================
echo        一键 Git 提交推送脚本
echo ==========================================
echo.

REM ========== 1. 检查是否在 Git 仓库中 ==========
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [错误] 当前目录不是 Git 仓库。
    echo        请把本脚本放到仓库根目录，或先执行 git init。
    goto :fail
)

REM ========== 2. 检查是否有提交信息参数 ==========
set "MSG=%~1"
if "%MSG%"=="" (
    set /p "MSG=请输入提交说明（直接回车用默认 "update"）: "
    if "!MSG!"=="" set "MSG=update"
)

REM ========== 3. 检查暂存区是否有改动 ==========
git add -A
if errorlevel 1 (
    echo [错误] git add 执行失败，请检查文件权限或仓库状态。
    goto :fail
)

git diff --cached --quiet
if not errorlevel 1 (
    echo [提示] 没有需要提交的改动，跳过 commit。
    goto :push
)

REM ========== 4. 提交 ==========
echo.
echo [执行] git commit -m "%MSG%"
git commit -m "%MSG%"
if errorlevel 1 (
    echo [错误] 提交失败。常见原因：
    echo        - 未配置 user.name / user.email
    echo          可执行：git config --global user.name "你的名字"
    echo                  git config --global user.email "你的邮箱"
    goto :fail
)

:push
REM ========== 5. 检查远程仓库是否配置 ==========
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [错误] 未配置远程仓库 origin。
    echo        请执行：git remote add origin 仓库地址
    goto :fail
)

REM ========== 6. 获取当前分支 ==========
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
if "%BRANCH%"=="HEAD" (
    echo [错误] 当前处于游离 HEAD 状态，无法确定推送分支。
    goto :fail
)
echo.
echo [信息] 当前分支：%BRANCH%

REM ========== 7. 先拉取远程更新，避免被拒绝 ==========
echo [执行] git pull --rebase origin %BRANCH%
git pull --rebase origin %BRANCH%
if errorlevel 1 (
    echo.
    echo [警告] 拉取失败或存在冲突。可能原因：
    echo        - 远程有新提交且与本地冲突
    echo        - 网络 / 认证问题
    echo        如果处于 rebase 冲突中，请手动解决后执行：
    echo          git rebase --continue
    echo        若要放弃本次 rebase：
    echo          git rebase --abort
    goto :fail
)

REM ========== 8. 推送 ==========
echo.
echo [执行] git push origin %BRANCH%
git push origin %BRANCH%
if errorlevel 1 (
    echo.
    echo [错误] 推送失败。常见原因：
    echo        - 认证失败：GitHub 已不支持密码，需用 Personal Access Token 或 SSH
    echo        - 无推送权限
    echo        - 远程分支有更新（可重新运行本脚本，会先 pull）
    goto :fail
)

echo.
echo ==========================================
echo    ✅ 全部完成，已推送到 origin/%BRANCH%
echo ==========================================
goto :end

:fail
echo.
echo ==========================================
echo    ❌ 操作中止，请根据上面的提示处理
echo ==========================================
endlocal
exit /b 1

:end
endlocal
exit /b 0