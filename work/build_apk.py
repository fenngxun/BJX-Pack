# -*- coding: utf-8 -*-
"""把「开箱即玩」发布包打成安卓 APK（幂等，可重跑）。

背景：发布包是桌面 HTML + img 目录，手机玩需要套一个 WebView 壳。
原 `Dol-BJX-Ex-main/dol星扩.apk` 就是 0.4.3.3 时代的 Cordova 壳，
这里复用它的包名/图标/权限，只换 assets 内容。

流程（全部幂等）：
  1. apktool d 反编译壳 -> work/_apkbuild/apk_src（已存在则复用，--fresh 强制重解）
  2. AndroidManifest 加 android:largeHeap="true"（97MB HTML 不加必 OOM）
  3. 替换 assets/www/Degrees of Lewdity.html + assets/www/img
  4. apktool b 重打包
  5. uber-apk-signer zipalign + v1/v2/v3 签名（固定 keystore，升级可覆盖安装）

前置工具（已下载到 work/_apkbuild/）：
  jdk-17.0.20.1+1/  apktool.jar  uber-apk-signer.jar  bjx.keystore
缺工具时的下载命令见本文件末尾注释。

用法：
    cd work && python build_apk.py            # 全流程
    cd work && python build_apk.py --fresh    # 重新反编译壳
    cd work && python build_apk.py --sign-only # 只重签名（改完 keystore 时）
"""
import io
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bjx_version import VERSION, DIST_DIR_NAME  # noqa: E402

WORK = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(WORK)
BUILD = os.path.join(WORK, '_apkbuild')
JDK = os.path.join(BUILD, 'jdk-17.0.20.1+1')
JAVA = os.path.join(JDK, 'bin', 'java.exe')
APKTOOL = os.path.join(BUILD, 'apktool.jar')
SIGNER = os.path.join(BUILD, 'uber-apk-signer.jar')
KS = os.path.join(BUILD, 'bjx.keystore')
SHELL_APK = os.path.join(ROOT, 'Dol-BJX-Ex-main', 'dol星扩.apk')
SRC = os.path.join(BUILD, 'apk_src')
DIST = os.path.join(ROOT, DIST_DIR_NAME)
OUT = os.path.join(ROOT, 'bjx-整合包-%s-安卓.apk' % VERSION)
UNSIGNED = os.path.join(BUILD, 'bjx-unsigned.apk')
SIGNED = os.path.join(BUILD, 'bjx-aligned-signed.apk')

KS_PASS = 'bjxpack'


def run(cmd, what, cwd=None):
    print('>> %s' % what)
    t0 = time.time()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='ignore')
    if p.returncode != 0:
        print(p.stdout[-3000:])
        print(p.stderr[-3000:])
        raise SystemExit('%s 失败 (exit %d)' % (what, p.returncode))
    print('   ok (%.1fs)' % (time.time() - t0))
    return p.stdout


def check_tools():
    missing = [p for p in (JAVA, APKTOOL, SIGNER, KS) if not os.path.exists(p)]
    if missing:
        raise SystemExit('缺工具:\n  ' + '\n  '.join(missing) +
                         '\n见 build_apk.py 末尾注释里的下载命令')
    if not os.path.exists(SHELL_APK):
        raise SystemExit('缺壳 APK: %s' % SHELL_APK)


def decompile(fresh):
    if fresh and os.path.isdir(SRC):
        shutil.move(SRC, SRC + '_old_%d' % int(time.time()))
    if os.path.isdir(SRC) and os.path.exists(os.path.join(SRC, 'AndroidManifest.xml')):
        print('>> 复用已反编译的壳（--fresh 可强制重解）')
        return
    run([JAVA, '-jar', APKTOOL, 'd', SHELL_APK, '-o', SRC, '-s', '-f'], 'apktool 反编译壳')


def patch_manifest():
    path = os.path.join(SRC, 'AndroidManifest.xml')
    xml = open(path, encoding='utf-8').read()
    if 'largeHeap' in xml:
        print('>> manifest 已有 largeHeap，跳过')
        return
    # 在 <application 标签里补 largeHeap（97MB HTML 在 WebView 里不加必 OOM）
    new, n = re.subn(r'(<application\b)', r'\1 android:largeHeap="true"', xml, count=1)
    if n != 1:
        raise SystemExit('manifest 里找不到 <application 标签，结构可能变了')
    open(path, 'w', encoding='utf-8').write(new)
    print('>> manifest 已加 largeHeap')


def replace_assets():
    www = os.path.join(SRC, 'assets', 'www')
    src_html = os.path.join(DIST, 'Degrees of Lewdity.html')
    src_img = os.path.join(DIST, 'img')
    for p in (src_html, src_img):
        if not os.path.exists(p):
            raise SystemExit('发布包缺 %s（先跑 make_dist.py）' % p)

    shutil.copyfile(src_html, os.path.join(www, 'Degrees of Lewdity.html'))
    print('>> HTML 已替换 (%.1f MB)' % (os.path.getsize(src_html) / 1048576))

    dst_img = os.path.join(www, 'img')
    if os.path.isdir(dst_img):
        # 批量删除会被安全策略拦，改用单次 rename 移出（不销毁数据）
        old = os.path.join(BUILD, '_old_img_%d' % int(time.time()))
        os.rename(dst_img, old)
        print('>> 旧 img 已移到 %s' % os.path.basename(old))
    shutil.copytree(src_img, dst_img)
    n = sum(len(f) for _, _, f in os.walk(dst_img))
    print('>> img 已替换 (%d 文件)' % n)


def build():
    run([JAVA, '-Xmx4g', '-jar', APKTOOL, 'b', SRC, '-o', UNSIGNED], 'apktool 重打包')
    print('   未签名包 %.1f MB' % (os.path.getsize(UNSIGNED) / 1048576))


def sign():
    if not os.path.exists(KS):
        raise SystemExit('缺 keystore: %s' % KS)
    run([JAVA, '-jar', SIGNER, '--apks', UNSIGNED,
         '--ks', KS, '--ksAlias', 'bjx',
         '--ksPass', KS_PASS, '--ksKeyPass', KS_PASS, '--allowResign'], 'zipalign + 签名')
    if not os.path.exists(SIGNED):
        raise SystemExit('签名产物不存在: %s' % SIGNED)


def verify_and_export():
    z = zipfile.ZipFile(SIGNED)
    names = z.namelist()
    html = [n for n in names if n.endswith('Degrees of Lewdity.html')]
    imgs = [n for n in names if '/img/' in n]
    man = z.read('AndroidManifest.xml')
    has_lh = b'l\x00a\x00r\x00g\x00e\x00H\x00e\x00a\x00p\x00' in man or b'largeHeap' in man
    assert html, 'APK 里没有 HTML'
    assert len(imgs) > 30000, 'img 文件数异常: %d' % len(imgs)
    assert has_lh, 'APK 里没有 largeHeap'
    assert any(n.startswith('META-INF/') and n.endswith('.RSA') for n in names), '缺签名'

    src_html = os.path.join(DIST, 'Degrees of Lewdity.html')
    same = z.read(html[0]) == open(src_html, 'rb').read()
    shutil.copyfile(SIGNED, OUT)
    print('\nAPK: %s' % OUT)
    print('  条目 %d / img %d / HTML 与源一致 %s / %.1f MB'
          % (len(names), len(imgs), same, os.path.getsize(OUT) / 1048576))
    assert same, 'APK 内 HTML 与发布包不一致'


def main():
    args = sys.argv[1:]
    check_tools()
    if '--sign-only' in args:
        sign()
        verify_and_export()
        return
    decompile('--fresh' in args)
    patch_manifest()
    replace_assets()
    build()
    sign()
    verify_and_export()


if __name__ == '__main__':
    main()

# ---------------------------------------------------------------------------
# 工具下载（GitHub 直连不通时用 gh-proxy.com 镜像）：
#   curl -L -o work/_apkbuild/jdk17.zip \
#     "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"
#   python -c "import zipfile;zipfile.ZipFile('work/_apkbuild/jdk17.zip').extractall('work/_apkbuild')"
#   curl -L -o work/_apkbuild/apktool.jar \
#     "https://gh-proxy.com/https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar"
#   curl -L -o work/_apkbuild/uber-apk-signer.jar \
#     "https://gh-proxy.com/https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar"
#   work/_apkbuild/jdk-17.0.20.1+1/bin/keytool -genkeypair -keystore work/_apkbuild/bjx.keystore \
#     -alias bjx -keyalg RSA -keysize 2048 -validity 10000 \
#     -storepass bjxpack -keypass bjxpack -dname "CN=BJX Pack, OU=Mod, O=BJX, L=CN, ST=CN, C=CN"
# ---------------------------------------------------------------------------
