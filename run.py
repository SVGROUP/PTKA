#!/usr/bin/env python3
import os
from pt_keepalive.app import main
ver = "2026-07-30 17:03:41"
ts = 1785402221
if __name__ == "__main__":
    os.environ["PTKA_VERSION"] = ver
    os.environ["PTKA_BUILD_TS"] = str(ts)
    print(f'下载转发端主程序启动，V1.0.1 ver={ver}')
    main(ts)
