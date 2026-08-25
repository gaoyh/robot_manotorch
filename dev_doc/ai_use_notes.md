# -----------------------------------------------------
##  
我想做一个手部关节的编辑器，能够对手部关节进行旋转、缩放、移动等操作，并且能够实时预览手部模型的变化。
这个编辑器是web端的，想将本工程的功能封装成一个docker服务，然后web页面可以调用，是否可行？

## 
先看一下这个仓库现有能力和入口，再判断怎么封装成 Docker 服务最合适。
我再确认一下仓库里有没有现成的服务端/可视化入口，判断是“直接包一层 API”还是得新增一层。
**可行，但要分两层做。** 这个仓库本身只是 `MANO` 的 PyTorch 计算层：输入 pose/shape，输出手部 `verts/joints`，并没有现成的 Web 服务或前端编辑器；README 里也明确它是一个可微分的 `ManoLayer`，示例只是本地 `matplotlib` 预览。

**推荐方案：**
- **Docker 后端**：用 Python 把 `ManoLayer` 封成 API（REST 或 WebSocket），输入关节参数/形状参数/全局位姿，输出 mesh 顶点、关节、faces。
- **Web 前端**：用 `three.js` / `babylon.js` 做实时渲染和交互控件。
- **实时预览**：拖动 slider 后前端把参数发给后端，后端快速算一帧并回传，前端立即更新模型。

**注意一点：**
- “**旋转**”非常适合 MANO（它本来就是关节参数化模型）。
- “**移动**”通常只对**根节点/整只手**做平移更合理。
- “**缩放**”如果是**整手缩放**可以做；如果是**单个关节缩放**，这不太符合 MANO 的标准物理含义，通常需要额外的 IK/变形层，或者直接改 mesh，而不是纯 MANO 参数。

如果你的目标是“**可编辑 + 实时预览**”，这个工程完全可以作为**后端算子服务**来用；但**编辑器本身**还需要单独做一个 Web UI。
# -----------------------------------------------------
##  
本工程有什么可以直接运行的服务或者demo界面么？ 不一定是web形式的。
## 
有，**但不是独立服务**，主要是几个可直接运行的 **Python demo 脚本**：

- `python examples/manopth_mindemo.py`：最小 demo，跑一次 MANO 前向并弹出手部可视化窗口
- `python examples/manopth_demo.py`：更完整的 demo，支持随机姿态/形状、前后向和简单性能循环
- `python test/test_demo.py`：偏测试，不是界面，但能验证随机手生成流程

这些 demo 都是**本地桌面可视化**，用的是 `matplotlib` 3D 图窗，不是 Web 页面，也没有现成的 REST/WS 服务入口。README 里也明确目前只是 `ManoLayer` + `demo.display_hand(...)` 这种调用方式。
# -----------------------------------------------------
##  
帮我初始化一下本工程的python虚拟环境吧， 以便能够运行上述的demo

##
conda env create -f /media/kddev/work1t/work_auto/t_robot/manopth/environment.yml -n manopth
conda run -n manopth python -c "import manopth; from manopth.manolayer import ManoLayer; print('import-ok', manopth.__file__)"

我先看一下仓库里有没有现成的依赖定义，然后直接把虚拟环境建起来。
依赖清单找到了，我把它读出来，按最小可运行环境去建。
可以，改用 conda 来建环境更合适。我先确认本机有没有 conda，以及能不能直接按仓库里的 `environment.yml` 起环境。
我直接按仓库的 `environment.yml` 创建 conda 环境；如果老版本依赖解析失败，我再给你切到一个可工作的兼容方案。
环境还在创建，我等它完成后再把可用性确认一下。
环境已经建好，我再把这个仓库本身装进该环境，方便直接跑 demo。
已经好了：我用 **conda** 创建了环境 **`manopth`**，并把当前仓库以 `editable` 方式装进去了。

**激活方式：**
```bash
conda activate manopth
```

**我做的验证：**
- `import manopth` 成功
- 仓库代码已可在该环境中直接调用

**注意：** 这个仓库里目前**没有** `mano/models` 下的 MANO pkl 模型文件，所以 `examples/manopth_mindemo.py` / `examples/manopth_demo.py` 还需要你补上 MANO 模型数据后才能完整显示手部模型。



# -----------------------------------------------------
##  
我想做一个手部关节的编辑器，能够对手部关节进行旋转、缩放、移动等操作，并且能够实时预览手部模型的变化。
这个编辑器是web端的，想将本工程的功能封装成一个docker服务，然后web页面可以调用，是否可行？
## 
我先看一下这个工程的结构和现有渲染/模型相关模块，再判断是否适合封装成 Docker 服务。
我看到仓库里有 `simple_app.py`，先看 README 和这个入口，判断现在是库、脚本还是已经带了 Web 交互原型。
我再确认一下核心 API 的输入输出，看看它是否天然适合做成“后端计算服务 + 前端实时编辑器”的形态。
可行，而且这套仓库**很适合做成“后端计算服务 + Web 前端编辑器”**。

原因是现有核心已经是**纯计算层**：`ManoLayer` 负责从 pose/betas 生成 `verts/joints/transforms_abs`，`AxisLayerFK` 负责关节轴/姿态分解与重组；它们都是确定性张量运算，天然适合封装成 Docker 里的 Python API 服务。现在的 `scripts/simple_app.py` 只是 `pyvista` 的本地交互预览，不是浏览器端 UI，所以**Web 化需要补一层前端**，但底层能力已经具备。

需要注意两点：  
1. **旋转/移动**很适合直接做：前端改 joint 参数，后端实时返回 mesh/joint/axis 数据即可。  
2. **缩放**要区分：`betas` 更像“手型/形状变化”，不是逐关节骨骼缩放；如果你想做“每个关节局部缩放”，需要在 MANO 之外扩展一层自定义骨架/蒙皮逻辑。

推荐架构是：**Docker 内 Python 服务（FastAPI + WebSocket）**，前端用 **Three.js/Babylon.js** 负责交互和实时渲染。后端提供诸如 `load_model`、`set_pose`、`set_shape`、`get_mesh`、`get_axes` 这类接口；前端拖动关节时发参数，后端回传顶点和关节坐标，浏览器即时更新。  
另外要把 `assets/mano` 等模型文件一起纳入容器，注意 MANO 资产的许可证约束。

如果你愿意，我可以继续帮你把这个方案细化成一版**Docker + API + Web 前端**的具体技术方案。

# -----------------------------------------------------
##  
继续
## 
可以，建议按 **“Python 计算后端 + Web 三维前端”** 做，MVP 很快就能落地。

**推荐方案**
- **后端**：Docker 里的 Python 服务（`FastAPI` / `WebSocket`）
- **核心计算**：复用 `ManoLayer`、`AxisLayerFK`，输入关节参数/shape 参数，输出 `verts / joints / transforms / axes`
- **前端**：`Three.js` 或 `Babylon.js`
- **实时交互**：滑块、拖拽 gizmo、关节树编辑器，改参数后通过 WebSocket 实时刷新

**数据流**
1. 前端加载手模型和关节树
2. 用户旋转/移动某个关节
3. 前端把当前 pose/betas 发给后端
4. 后端跑 MANO 前向，返回：
   - 网格顶点 `verts`
   - 关节 `joints`
   - 关节轴 `axes`
   - 可选：每个关节的 `transforms_abs`
5. 前端更新 mesh、骨架、轴辅助线，实现实时预览

**接口建议**
- `POST /load`：加载左右手、初始 shape、初始 pose
- `POST /solve`：输入 pose/betas，返回 mesh 和 joints
- `POST /compose`：如果你想用“解剖坐标系下的欧拉角”编辑关节，这个接口很合适
- `WS /stream`：高频拖拽时走实时通道，减少延迟

**你现在这个工程的适配性**
- **很适合**做骨架驱动和手型解算
- `simple_app.py` 说明本地预览已经存在，但它是桌面可视化，不是 Web UI
- 真正缺的是 **Web 渲染层** 和 **服务层封装**

**需要提前想清楚的点**
- `betas` 是“手型/形状”，不等于逐关节缩放
- 如果你要“真正的关节缩放”，需要在 MANO 外再加一层自定义骨架控制
- 浏览器里建议只传**参数**，不要每次传大文件；后端返回压缩后的顶点数组或 glTF/mesh 数据

**最小可行版本（MVP）**
- 左侧：关节树 + 轴向控制器
- 右侧：Three.js 手模型实时渲染
- 后端：`ManoLayer.forward()` + `AxisLayerFK.forward()/compose()`
- 通讯：HTTP 起始加载，WebSocket 实时更新

如果你要，我下一步可以直接给你画一版 **目录结构 + API 协议 + Dockerfile 方案**。
# -----------------------------------------------------
##  

## 
可以，下面是一版**可落地的目录结构 + API 协议 + Docker 方案**。

**建议架构**
- **后端**：Python + FastAPI + WebSocket
- **计算核心**：复用本仓库 `ManoLayer` / `AxisLayerFK`
- **前端**：Three.js
- **部署**：单个 Docker 容器先跑通，后续再拆分前后端

**目录结构**
```text
hand-editor/
  backend/
    app/
      main.py
      api/
        routes.py
      core/
        mano_service.py
        schema.py
      assets/
        mano/
        anchor/
    requirements.txt
    Dockerfile
  frontend/
    src/
      main.ts
      viewer/
      controls/
      api/
    package.json
    vite.config.ts
    Dockerfile
  docker-compose.yml
```

**后端 API**
- `POST /api/load`
  - 输入：`side`, `betas`, `pose`
  - 输出：初始 `verts`, `joints`, `transforms_abs`
- `POST /api/solve`
  - 输入：当前 `pose`, `betas`
  - 输出：更新后的 `verts`, `joints`, `axes`
- `POST /api/compose`
  - 输入：按“解剖坐标系”编辑的 euler angles
  - 输出：对应 MANO pose
- `WS /ws/stream`
  - 前端拖拽时实时推送参数
  - 后端实时回传更新后的 mesh 数据

**服务层建议**
- `mano_service.py`
  - 初始化 `ManoLayer`
  - 缓存左右手模型
  - 提供 `solve_pose()` / `compose_pose()` / `get_axes()`
- `schema.py`
  - 用 Pydantic 定义请求/响应
- `main.py`
  - HTTP + WebSocket 入口

**Docker 思路**
- 后端容器里放：
  - Python、PyTorch、MANO assets
  - `assets/mano` 必须一起打包
- 前端容器里放：
  - 静态打包后的 Three.js 页面
- 开发期可用 `docker-compose` 同时起前后端

**后端 Dockerfile 示例**
```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**前端交互流程**
1. 页面加载模型
2. 用户拖动关节/滑块
3. 前端发送 pose/betas
4. 后端计算 mesh
5. 前端更新 Three.js 网格和骨架

**MVP 最小功能**
- 手部旋转
- 关节树编辑
- 实时预览
- 左/右手切换
- 导出当前 pose 为 JSON

如果你要，我下一步可以直接给你补一版**FastAPI 接口草案 + 前端调用示例 + `docker-compose.yml`**。
# -----------------------------------------------------
##  
继续
## 
下面是一版可以直接开工的草案。

**FastAPI 接口**
```python
# backend/app/schemas.py
from pydantic import BaseModel
from typing import List, Literal, Optional

class LoadReq(BaseModel):
    side: Literal["left", "right"] = "right"
    pose: List[float]   # 48 or 51, 取决于你的定义
    betas: List[float] = [0.0] * 10

class SolveReq(BaseModel):
    side: Literal["left", "right"] = "right"
    pose: List[float]
    betas: List[float] = [0.0] * 10

class ComposeReq(BaseModel):
    side: Literal["left", "right"] = "right"
    ee_angles: List[float]  # 16 * 3

class MeshResp(BaseModel):
    verts: list
    joints: list
    transforms_abs: list
    axes: Optional[dict] = None
```

```python
# backend/app/main.py
from fastapi import FastAPI, WebSocket
from .schemas import LoadReq, SolveReq, ComposeReq

app = FastAPI()

@app.post("/api/load")
def load(req: LoadReq):
    return solve_impl(req.side, req.pose, req.betas)

@app.post("/api/solve")
def solve(req: SolveReq):
    return solve_impl(req.side, req.pose, req.betas)

@app.post("/api/compose")
def compose(req: ComposeReq):
    pose = compose_impl(req.side, req.ee_angles)
    return {"pose": pose}

@app.websocket("/ws/stream")
async def stream(ws: WebSocket):
    await ws.accept()
    while True:
        payload = await ws.receive_json()
        out = solve_impl(payload["side"], payload["pose"], payload["betas"])
        await ws.send_json(out)

def solve_impl(side, pose, betas):
    # 这里接 manotorch.Man oLayer / AxisLayerFK
    return {
        "verts": [],
        "joints": [],
        "transforms_abs": [],
        "axes": None,
    }

def compose_impl(side, ee_angles):
    return []
```

**前端调用**
```ts
// solve
const res = await fetch("/api/solve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ side: "right", pose, betas }),
});
const data = await res.json();
updateMesh(data.verts);
updateSkeleton(data.joints);
```

```ts
// websocket
const ws = new WebSocket("ws://localhost:8000/ws/stream");
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  updateMesh(data.verts);
};
ws.send(JSON.stringify({ side: "right", pose, betas }));
```

**docker-compose.yml**
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend/app/assets:/app/assets

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

**关键实现建议**
- **实时拖拽**走 WebSocket；**初次加载/导出**走 HTTP。
- **前端只传参数**，不要每次传模型文件。
- **后端缓存 ManoLayer**，不要每次请求都重新初始化。
- `betas` 做形状变化，关节编辑用 `pose`，如果要“解剖坐标系编辑”，再走 `compose`。

如果你要，我下一步可以直接给你补一版**可运行的 backend 目录骨架**。
# -----------------------------------------------------
##  
既然可行，那你将实施分成两到三个大步骤，然后咱们一个步骤一个步骤实施。

## 
可以，建议拆成 **3 个大步骤**：

1. **后端服务化**
   - 把 `ManoLayer / AxisLayerFK` 封装成一个 Python 服务
   - 统一输入输出：`pose / betas / side -> verts / joints / transforms / axes`
   - 先跑通 HTTP 接口，保证计算结果稳定

2. **实时交互接口**
   - 加 WebSocket 实时更新
   - 定义前端编辑时的消息协议
   - 支持关节旋转、平移、形状变化的即时预览

3. **Web 前端 + Docker 集成**
   - 用 Three.js 做手模型渲染和关节控件
   - 接入后端 API，完成可交互编辑器
   - 最后整理成 `docker-compose` 一键启动

我建议我们先做 **第 1 步：后端服务化**，因为这是整个系统的核心，后面前端和实时通信都依赖它。
# -----------------------------------------------------
##  
好的，实施第一步吧
## 
onda run -n manotorch-web pip install --no-build-isolation -r backend/requirements.txt

我先补齐后端骨架，并尽量复用现有 `manotorch` 能力；先看一下依赖和当前是否已有可直接挂载的服务入口。
我开始落地后端：先做一个可复用的服务层、HTTP 接口和启动骨架，并把缺失 MANO 资产的情况处理成明确报错。
我先修两个小问题：仓库根路径计算和一个布尔值拼写，顺便把 CORS 配置改成更稳妥的默认值。
我再做一个轻量运行检查：只导入服务层，不触发 MANO 资产加载，确认服务骨架能在当前环境下起得来。
服务层导入被 `deprecation` 卡住了，我把后端依赖装一下，再做一次真实导入检查。
我先记下这个工作流偏好，然后切到本工程自己的 conda 环境里做验证，避免污染本机 Python。
我现在新建一个独立 conda 环境做验证，然后只在这个环境里装后端依赖。
依赖安装还在跑，我先等它出结果，再用这个 conda 环境做一次真正的导入验证。
我把请求模型再收紧一点：`/api/solve` 保持 `pose` 必填，`/api/load` 才给默认零姿态。
`chumpy` 的构建方式和现代 pip 有点冲突，我把后端依赖改成可安装的形式，再重试这个 conda 环境。
我把安装方式改到命令行和 Docker 里，而不是塞进 requirements 文件里。这样能绕过 `chumpy` 的构建问题。
依赖安装还在进行中，我先把刚才改过的代码再编译一遍，确保没有引入语法问题。
新环境装依赖太慢了，我先看看现有的手部相关 conda 环境里是否已经具备这些包，便于做一次真实导入验证。
我找到一个已经具备 torch/chumpy/scipy 的手部相关 conda 环境，只补上后端要的 Web 依赖，就能完成真实导入验证。
后端依赖已经装进手部相关 conda 环境了，我现在做最后一次真实导入和健康检查。
依赖已经在 project conda 环境里装好了，我再做一次真正的模块导入和 readiness 检查。
后端骨架已经能在独立 conda 环境里导入了，我看一下改动范围，确保这一步只落在服务层。
我再补一项更贴近真实使用的检查：在 project conda 环境里起一下 Uvicorn，再打 `/healthz`。
已完成第一步：后端服务骨架已经落到仓库里了。

**现在有了**
- `backend/app/main.py`：FastAPI 入口
- `backend/app/core/mano_service.py`：封装 `ManoLayer` / `AxisLayerFK`
- 接口：`/api/load`、`/api/solve`、`/api/compose`、`/ws/stream`、`/healthz`
- `backend/Dockerfile` 和 `backend/requirements.txt`
- `README.md` 增加了后端启动说明

**验证结果**
- 在独立 conda 环境 `manotorch-web` 里完成了依赖安装
- `uvicorn backend.app.main:app` 可启动
- `GET /healthz` 返回正常：`{"ok":true,"ready":false,...}`  
  其中 `ready=false` 是因为仓库里没有官方 `assets/mano`，需要你后续挂载 MANO 资产或设置 `MANO_ASSETS_ROOT`

下一步可以直接做第 2 步：**WebSocket 实时交互协议**。
# -----------------------------------------------------
##  
继续
## 
我继续做第 2 步：把实时编辑的 WebSocket 协议和消息类型补全，并让后端更适合拖拽高频更新。
我先把 WebSocket 的消息协议做成显式的 `hello / load / solve / compose / ping`，并支持服务端缓存当前姿态，方便前端拖拽时只传增量。
我把 `/ws/stream` 改成有状态会话：首次 `hello` 建立当前手势，后续只传改动字段就能实时刷新。
我做一轮最小的 WebSocket 冒烟测试：先连上，确认握手消息，再发 `ping`。
我把验证方式换成直接调用环境里的 Python，可避免 `conda run` 把输出吃掉。
刚才把测试服务停掉了，我重新拉起一个临时实例，再做一次 WebSocket 实际连通性验证。
第 2 步已经补完：`/ws/stream` 现在是**有状态实时会话**了，支持 `hello / solve / compose / ping`，会先发 `ready`，之后前端只需要传增量参数就能拿到最新 `result` / `pose`。同时我把协议写进了 README，后端也保留了 HTTP 接口作为初次加载和导出通道。

**验证过了**
- 后端代码可编译
- 在独立 conda 环境里可导入、可启动
- WebSocket 实测可连通，`ping -> pong` 正常返回
- 当前 `ready=false` 只是因为本机仓库里还没挂 MANO 资产，这是预期状态

如果你继续，我就做第 3 步：**Web 前端 + Docker 集成**。
# -----------------------------------------------------
##  
继续
## 
我继续补第 3 步：前端最小可运行壳 + Docker 编排，让浏览器能直接连后端。先看一下仓库里是否已有前端工程或 Node 约束。
我用“静态前端 + Three.js CDN + nginx 容器”的方式做一个最小可用 Web 端，避免先引入 Node 构建链。这样能最快把后端连起来。
我先做一个最小校验：检查前端静态脚本的语法，再看一下整套 Docker 文件有没有明显拼写/路径问题。
我把前端连接流程补一下：WebSocket 一打开就自动发 `hello`，这样页面连上后能立刻拿到一帧预览。
我再跑一轮前端语法检查，确认这次连接逻辑补丁没有引入语法错误。
我最后用 `docker compose config` 做一下整体编排校验，确认前后端和挂载路径都能被 Compose 正确解析。
第三步也落好了：现在仓库里有了**前端页面 + Docker 编排**，可以直接用 `docker compose up --build` 启动后端和 Web 页面。

**结果**
- `frontend/`：静态 Web 编辑器壳，带 `pose/betas` 滑条、WebSocket 连接、Three.js 预览
- `docker-compose.yml`：后端 `8000`，前端 `3000`
- `frontend/Dockerfile`：nginx 托管静态页
- README 已补运行方式

**验证**
- `node --check frontend/app.js` 通过
- `docker compose config` 通过

**注意**
- 现在前端是**最小可用版**：已经能连后端、拉取结果、显示关节/网格，但还没做专门的手部 gizmo/拖拽控件。
- 需要把官方 `assets/mano` 挂进去，后端才会真正 `ready=true`。
# -----------------------------------------------------
##  
继续
## 
我把前后端改成**同源访问**：前端走 nginx，`/api` 和 `/ws` 反代到后端，这样能去掉跨域依赖，也更适合 Docker 部署。先看当前前端入口和 nginx 配置。
我把前端入口改成“**默认同源**”，这样在 Docker 里直接打开 `http://localhost:3000` 就能访问 `/api` 和 `/ws`。同时给 nginx 加上 WebSocket 反代。
我再跑一次前端语法和 compose 解析，确认同源改造没有把入口搞坏。
已把前端改成**同源部署**了：`frontend/nginx.conf` 现在会把 `/api/` 和 `/ws/` 反代到后端，浏览器直接打开 `http://localhost:3000` 就能用，不再依赖单独填 `http://localhost:8000`。

**这次还补了**
- 前端默认 backend 为空时自动走同源
- WebSocket 断线/未连接时会先缓存一条待发消息
- README 更新了新的 Docker 使用方式

**验证**
- `node --check frontend/app.js` 通过
- `docker compose config` 通过

如果你要继续，我下一步可以把前端从“滑条版”升级成**真正的手部关节树 + 单关节 gizmo 交互**。
# -----------------------------------------------------
##  
你告诉我一下，我自己怎么启动服务，怎么访问前端页面，然后再继续完善前端

## 
先这样启动：

**Docker 方式（推荐）**
```bash
cd /media/kddev/work1t/work_auto/t_robot/manotorch
docker compose up --build
```

**访问前端**
- 打开：`http://localhost:3000`
- 前端里 `Backend` 输入框可以留空，默认走同源代理
- 后端健康检查：`http://localhost:8000/healthz`

**前提**
- 需要把官方 MANO 资产放到 `assets/mano/`
- 结构至少要有：
  `assets/mano/models/MANO_RIGHT.pkl`
  `assets/mano/models/MANO_LEFT.pkl`

**如果你想单独起后端**
```bash
conda activate manotorch-web
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

**前端页面怎么进**
- Docker 起好后直接浏览器访问 `http://localhost:3000`
- 页面左侧是控制面板，右侧是 Three.js 预览区

我接下来会继续把前端从“滑条预览版”升级成**关节树 + 单关节拖拽/旋转 gizmo**。
# -----------------------------------------------------
##  
执行如下语句前，用激活conda环境么？                                                                                                                                                                                                                                                                       15:15 ┃
   docker compose up --build 
## 
不用。

`docker compose up --build` 是走 **Docker 容器**，不依赖你本机当前激活的 conda 环境。  
你只需要在仓库根目录执行：

```bash
cd /media/kddev/work1t/work_auto/t_robot/manotorch
docker compose up --build
```

只有你想**直接在本机跑后端**（不用 Docker）时，才需要：

```bash
conda activate manotorch-web
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```
# -----------------------------------------------------
##  
我直接使用如下指令启动：
uvicorn backend.app.main:app --host 0.0.0.0 --port 8008
然后通过网页：http://localhost:8008/ 访问
结果页面返回：{"detail":"Not Found"}
## 
正常，`uvicorn backend.app.main:app` 现在只启动的是**后端 API**，没有把前端页面挂在 `/` 上，所以访问 `http://localhost:8008/` 会是 `{"detail":"Not Found"}`。

你现在应该这样访问：

- 后端健康检查：`http://localhost:8008/healthz`
- API 文档：`http://localhost:8008/docs`
- 前端页面：`http://localhost:3000/`（如果用 `docker compose up --build` 启动前端）

如果你想**只用一个 8008 端口**同时看到网页和 API，那我下一步可以把前端静态页也挂到这个 FastAPI 服务里，这样 `http://localhost:8008/` 就直接打开编辑器。
# -----------------------------------------------------
##  
如何实现 ：官方 MANO 资产放到 `assets/mano/`  
## 
把 **MANO 官方下载包** 解压后，按它的目录结构放进去。

**目标结构**
```text
assets/mano/
  info.txt
  LICENSE.txt
  models/
    MANO_LEFT.pkl
    MANO_RIGHT.pkl
    SMPLH_female.pkl
    SMPLH_male.pkl
  webuser/
  ...
```

**做法**
1. 去 MANO 官方网站下载模型包（需要账号和许可）
2. 解压得到类似 `mano_v*_*/` 的目录
3. 把里面内容复制到本仓库的 `assets/mano/`

例如：
```bash
mkdir -p assets/mano
cp -r /path/to/mano_v*_*/. assets/mano/
```

**如果你用 Docker**
可以直接把宿主机的 `assets/mano` 挂到容器里：
```yaml
volumes:
  - ./assets/mano:/app/assets/mano:ro
```

**检查一下**
```bash
ls assets/mano/models/MANO_RIGHT.pkl
ls assets/mano/models/MANO_LEFT.pkl
```

只要这两个 pkl 在，后端就能初始化。
# -----------------------------------------------------
##  
$ docker compose up --build
Compose can now delegate builds to bake for better performance.
 To do so, set COMPOSE_BAKE=true.
[+] Building 121.1s (2/2) FINISHED                                                                                                                                                                                                                                                                   docker:default
 => [backend internal] load build definition from Dockerfile                                                                                                                                                                                                                                                   0.2s
 => => transferring dockerfile: 346B                                                                                                                                                                                                                                                                           0.0s 
 => ERROR [backend internal] load metadata for docker.io/library/python:3.10-slim                                                                                                                                                                                                                            120.1s 
------
 > [backend internal] load metadata for docker.io/library/python:3.10-slim:
------
failed to solve: DeadlineExceeded: DeadlineExceeded: DeadlineExceeded: python:3.10-slim: failed to resolve source metadata for docker.io/library/python:3.10-slim: failed to do request: Head "https://hub-mirror.c.163.com/v2/library/python/manifests/3.10-slim?ns=docker.io": proxyconnect tcp: dial tcp 192.168.21.23:7897: i/o timeout
## 
问题不在代码，是 **Docker 拉基础镜像失败**：`python:3.10-slim` 需要去 `hub-mirror.c.163.com`，但你当前代理/镜像源超时了，所以 `docker compose up --build` 卡在 **拉镜像阶段**。

**可行处理**
1. **先换一个能访问的镜像源/代理**，再重试 `docker compose up --build`
2. **改用本机 conda 直接启动**，不走 Docker：
   ```bash
   conda activate manotorch-web
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8008
   ```
3. **如果必须 Docker**，我可以把 `backend/Dockerfile` 改成你本机更容易拉到的基础镜像，或者改成你本地已有镜像名

**当前结论**
- 代码没报错
- 是 Docker 网络/镜像拉取问题
- 先把基础镜像可用性解决，构建才能继续

# -----------------------------------------------------
##  
现在:
1、mano模型已经放到assets/mano/了，
2、使用conda切换了环境，并使用“uvicorn backend.app.main:app --host 0.0.0.0 --port 8008”启动了web服务

但接下来在浏览器里直接访问http://localhost:3000/，但是页面直接显示无法访问
## 
这是正常的：你现在**只启动了后端**，`8008` 上没有前端页面，所以 `http://localhost:3000/` 当然访问不到。

**当前状态**
- `uvicorn backend.app.main:app --port 8008` = 只有 API
- `3000` = 需要单独起前端服务，或者用 `docker compose up --build` 一起起

**你现在可用的方式**
1. 先确认后端正常：
   - `http://localhost:8008/healthz`
   - `http://localhost:8008/docs`

2. 如果你想直接看前端页面，再起一个静态前端服务：
   ```bash
   python -m http.server 3000 -d frontend
   ```
   然后浏览器打开：
   - `http://localhost:3000/`

3. 打开前端后，把页面里的 **Backend** 填成：
   - `http://localhost:8008`

这样前端就会连到你当前的 uvicorn 服务。

**为什么现在会失败**
- 你没有启动 `3000` 端口上的前端服务
- 之前我给的 `3000` 是 Docker/nginx 那套前端入口，不是 uvicorn 自动提供的

如果你想要，我下一步可以直接把这个工程改成：**只启动一个 `uvicorn`，然后 `http://localhost:8008/` 同时打开前端和 API**。
# -----------------------------------------------------
##  
现在后端服务已经启动了，前端页面也可以访问了，但是在前端页面里点击“Load”按钮后，页面显示“Failed to load model: 500 Internal Server Error”，请问如何解决？
## 
我先定位 `cv2` 是从哪条初始化链路里冒出来的，然后决定是补依赖还是改导入方式。
我把后端依赖补上 `opencv-python`，因为 MANO 的 `mano/webuser` 初始化链路确实直接 `import cv2`。
我先把运行中的 conda 环境也补上这个包，并做一次后端初始化验证，确认问题真的消掉。
我再做一次实际初始化检查：如果 `cv2` 已补上，错误应该会变成别的更具体的东西，或者直接 ready。
我把这条依赖关系记下来，后面再起环境时就不会漏掉。
原因已确认：`MANO` 初始化链路里会直接 `import cv2`，你当前那个正在跑的 `uvicorn` 进程启动时没有这个包。

**我已经补了**
- `backend/requirements.txt` 加了 `opencv-python`
- 当前 `manotorch-web` 环境里也装好了 `opencv-python`
- 现在在该 conda 环境里初始化已能通过，`ready=True`

**你现在要做的**
1. 停掉正在运行的 `uvicorn`
2. 重新启动：
   ```bash
   conda activate manotorch-web
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8008
   ```

然后再点前端的 **Connect**，这次应该就不会再报 `No module named 'cv2'` 了。

那个 `torch.cross` 的 warning 不是致命错误，可以先忽略。
# -----------------------------------------------------
##  
现在前端页点击connect后，页面可以正确展示了，并且右侧视图中，手部关节点和网络也可以正确显示了。
下面可以做哪些操作，可以更好地控制手的姿态和形状呢？
## 
可以优先做这几类控制，效果最好：

**1. 关节树编辑**
- 按手腕/每根手指/每个指节分层展示
- 点选某个关节后，只编辑它和它的子关节
- 支持展开/折叠，避免 48 维滑条太难用

**2. 单关节 Gizmo**
- 给选中的关节加旋转控件（X/Y/Z 轴）
- 直接拖动旋转，比滑条更直观
- 适合调拇指根部、指尖弯曲这类精细动作

**3. 解剖坐标系编辑**
- 不是按世界坐标转，而是按“bend / spread / twist”转
- 这样更符合手的真实运动
- 你这个工程里 `AxisLayerFK` 正好适合做这个

**4. 预设姿态**
- 张开手、握拳、捏取、食指指向、OK 手势
- 一键切换，再微调
- 适合快速搭姿态

**5. 形状控制**
- `betas` 控制手型/手掌胖瘦/手指粗细
- 做成少量预设滑条：瘦手、标准、宽手、长指
- 比 10 个原始 beta 全暴露更好用

**6. 根节点控制**
- 手腕整体旋转/平移/缩放
- 先调整体朝向，再调手指局部姿态

**7. 约束和联动**
- 父关节带动子关节
- 限制每个关节的可旋范围，避免扭坏
- 拖一个关节时自动传播到后续指节

**8. 录制/回放**
- 保存一组姿态
- 支持复制当前姿态、粘贴到另一只手
- 支持关键帧插值，方便做连续动作

**建议优先级**
- 第一阶段：**关节树 + 选中关节旋转 + 预设姿态**
- 第二阶段：**解剖坐标系编辑 + 约束**
- 第三阶段：**关键帧/动画/复制粘贴**

如果你要，我下一步可以直接帮你定一个**前端交互方案**：先把当前滑条版升级成“关节树 + 选中关节旋转面板”。
# -----------------------------------------------------
##  
继续
## 
我先看新路径下当前前端结构，然后把“关节树 + 选中关节旋转面板”做成最小可用版本。
我先确认一下 MANO 内部 16 个关节的大致命名/顺序，免得树控件和真实姿态对应错位。
我开始落地：先加关节树、选中关节编辑区，再把它和后端 `compose`/`solve` 串起来。
我补一下刚才的细节：把 48 个 pose 滑条也同步到状态里，避免树控件改姿态后面板显示不同步。
我刚才的检查命令跑在旧工作目录上了，我直接切到新路径再做一次语法验证。
我把 `app.js` 后半段也看一下，确认有没有漏掉括号或事件绑定问题。
我顺手把形状控制也补个最实用的按钮：一键把 `betas` 归零，方便快速回到标准手型。
已做好：左侧现在有**关节树**和**选中关节控制面板**。

**怎么用**
- 点 `Joint Tree` 里的某个关节
- 在 `Selected Joint` 里调 `twist / spread / bend`
- 后端会先 `compose` 成新的 pose，再 `solve` 刷新右侧手模型
- `Reset Selected`：只清当前关节
- `Reset All Joints`：清全部关节
- `Reset Shape`：把 `betas` 归零，回到标准手型

**补充**
- 旧的 48 维 pose 滑条还在 `Advanced Pose Sliders` 里，作为兜底
- `Betas` 仍然保留，可以继续细调手型

**你现在要做的**
- 刷新前端页面，最好强制刷新 `Ctrl+Shift+R`
- 重新 `Connect` 一次即可

如果你要，我下一步可以继续把这个“选中关节”升级成**可拖拽的 3D 旋转 gizmo**。
# -----------------------------------------------------
##  
继续
## 
我开始把 3D gizmo 接进去：先加状态和辅助函数，再把它挂到选中关节上。
我现在补 3D gizmo 的创建、定位和拖拽逻辑。
我补最后一块：根据最新关节位置和轴向，把 gizmo 贴到当前选中的关节上。
我补一个小修：切换关节时立即刷新 gizmo，避免选中状态和 3D 位置不同步。
我做一次语法检查，确保这版 gizmo 代码能直接跑。
我再用最直接的方式跑一次检查，排除是命令包装导致的权限问题。
我顺手把静态资源版本号也往前推一版，避免浏览器继续读旧缓存。
已继续：现在前端里加了一个**3D 旋转 gizmo**。

**现在可以做的**
- 在左侧 `Joint Tree` 里选一个关节
- 右侧 3D 视图里会出现对应关节的三色旋转环
- 直接拖动红/绿/蓝环，就能改这个关节的 `twist / spread / bend`
- `Reset Selected` 只清当前关节
- `Reset All Joints` 清所有关节
- `Reset Shape` 清 `betas`

**我还顺手做了**
- gizmo 会跟着当前关节位置走
- 选中关节后，面板和 3D 视图会同步
- 静态资源版本号也往前推了一版，方便刷新缓存

**你现在要做的**
- 刷新页面，最好强制刷新：`Ctrl+Shift+R`
- 重新点一下 `Connect`

如果你愿意，下一步我可以继续把这个 gizmo 做得更好一点：  
**加 hover 高亮、拖拽灵敏度、以及在 3D 里直接点选关节**。
# -----------------------------------------------------
##  
继续
## 
我继续把 3D 交互补齐：先看当前 gizmo 代码，再加“悬停高亮 + 直接点选关节”。
我继续补交互细节：在 3D 里直接点关节点选中，并把悬停的关节/旋转环高亮。
我把 3D 视图再升级一步：加“鼠标悬停提示”和“点关节直接选中”，这样不用每次都从左侧树里找。
我把静态资源版本号也再往前推一版，避免浏览器继续拿旧模块缓存。
我再做一个最小语法检查，确认刚加的 hover / 点选逻辑没有把 JS 结构弄坏。
继续了：现在 3D 视图里可以**直接点关节点选中**，并且有**悬停高亮**了。

**新增交互**
- 鼠标移到关节上，会出现悬停标记
- 直接点击某个关节，会选中它并同步左侧树
- 当前选中关节仍然用三色 gizmo 做旋转
- 拖拽 gizmo 时会临时禁用 OrbitControls，避免和视角旋转冲突

**顺手补的**
- 选中关节和悬停关节各自有独立高亮 marker
- gizmo 的当前轴在悬停/拖拽时会更亮
- 静态资源版本号已再升级一版，建议刷新时强制刷新缓存

**你现在做**
- 刷新页面，最好 `Ctrl+Shift+R`
- 在 3D 视图里直接点关节点试试

下一步如果你要，我可以继续加：
1. **鼠标悬停时显示关节名称**
2. **右键/快捷键切换 twist-spread-bend**
3. **关节可旋转范围限制**
# -----------------------------------------------------
##  
继续  
## 
我继续补“悬停显示关节名”，这样 3D 里点选/拖拽会更清楚。先看当前交互代码位置。
我给 3D 视图加一个浮动提示框，悬停关节/旋转环时直接显示名字和轴向。
我把 tooltip 改成纯文本换行，避免 `innerHTML` 带来的不必要风险。
我再做一次语法检查，确认 tooltip 这版改动能直接跑。
已继续：现在 3D 视图里悬停关节/旋转环会弹出**浮动提示框**，直接显示关节名和当前轴（twist / spread / bend）。

**新增效果**
- 悬停关节：显示 `Wrist / Finger ...`
- 悬停 gizmo：显示当前轴名
- 点击关节：会同时高亮并显示提示

**你现在要做**
- 刷新页面，最好 `Ctrl+Shift+R`
- 再试着把鼠标移到关节点上

如果你要，我下一步可以继续做：
1. **键盘快捷键切换 twist/spread/bend**
2. **拖拽灵敏度调节**
3. **关节旋转范围约束**
# -----------------------------------------------------
##  
在继续之前，我们先改改已经存在的bug，参看 @pic/scene1.png
1、界面左侧的"Joint Tree"中，是不是应该有15个节点？目前只有11个。
2、右侧3D视图中，鼠标移动到关节上时，有时选中状态不是很正确，鼠标明明落在某个关节上，但确实选中另外一个关节
3、选中关节后，右侧3D视图中，那个蓝、绿、红的旋转环，好像不支持什么操作呢
## 
我先对照 `scene1.png` 和当前交互代码，分别把树节点数量、关节拾取和旋转环交互三个问题拆开查。
我先重构关节数据：树里只保留 15 个可旋转关节，手腕作为单独根控件；再把 2D/3D 拾取改成“屏幕最近点”，避免点偏到邻近关节。
我给手腕单独补一个入口，不占用树节点计数。这样树里就是 15 个指关节。
我把手腕按钮接到 DOM 上，然后开始修屏幕拾取：不再用“射线碰点”，改成“鼠标附近最近的关节”。
我把 3D 选点也一起改成屏幕坐标最近关节，并给 gizmo 加一层更容易命中的“隐形拾取环”。
我补上几处遗漏：把 gizmo 拾取层注册进状态，并确认代码里不再引用旧的点拾取函数。
我再看尾部，顺手把 gizmo 交互状态和状态对象补完整。
我把最后几个漏项补上：gizmo 拾取对象注册进状态，并把静态版本再抬一版，避免浏览器继续吃旧脚本。
我发现一个关键点：后端返回了 21 个点，但可编辑的只有前 16 个关节，后面 5 个是指尖采样点。鼠标拾取把这些点也算进去了，这就是“点在 A，却选到 B”的主要原因。
我再做一次文本级检查，确认旧的点拾取逻辑已经被替换掉。
我又发现一个会影响 gizmo 命中率的问题：隐形拾取环没跟着一起缩放。这个会导致鼠标命中范围和可见环不一致，我一起修掉。
已修这 3 个点：

**1. Joint Tree 节点数**
- 现在树里是 **15 个可编辑关节**；
- `Wrist` 单独放在上面，不再算进树节点里。

**2. 3D 关节拾取不准**
- 之前是射线碰点，容易误选到邻近点；
- 现在改成**屏幕空间最近关节**，并且只在 **前 16 个可编辑关节**里选，后面的 5 个指尖采样点不参与拾取。

**3. 旋转环不好操作**
- 现在给 gizmo 加了**更大的隐形拾取环**；
- 这些拾取环和可见环一起缩放、对齐，命中会稳定很多。

**你现在需要**
- 刷新前端，最好强制刷新：`Ctrl+Shift+R`

如果刷新后还有细节不顺，我下一步就继续把：
- 旋转环拖拽手感
- hover 高亮
- 关节名称提示  
再打磨一轮。
# -----------------------------------------------------
##  
3D视图中，鼠标移动到食指指尖，显示的tip 是“Middle/middle(#8)”
鼠标移动到小指的四个关节上，都无法显示tip
## 
我先核对这套 MANO 输出的真实关节顺序，`tip` 和小指那几组很可能是索引映射写错了。
我再找一下仓库里有没有现成的关节命名或顺序说明，尽量和底层输出对齐，而不是纯猜。
我直接改两件事：**tooltip 用完整 21 个点**，**点击选择仍限制在可编辑的 16 个关节**，这样尖端能显示、编辑也不乱。
我再快速核对一下改完后的 `JOINT_NAMES` 和拾取函数，避免数组长度或参数名写漏。
修了这两个点：

- **tooltip 现在按 21 个关节点做拾取**，不再只看前 16 个可编辑点，所以指尖会显示真正的 `tip`
- **点击选中仍然只限制在 16 个可编辑关节**，不会把 tip 当成可编辑节点

另外我把 hover 命中阈值调大了，`pinky` 这类较小关节更容易被识别。

你刷新页面后再试：
- 食指指尖应该能显示 `Index / tip`
- 小指四个关节附近也会更稳定地出 tooltip

如果你刷新后还有某个关节名称对不上，我再把 21 个点的命名顺序按后端实际输出精确对齐。
# -----------------------------------------------------
##  
你再明确一下， Joint Tree 中，你设计的原则是什么，到底应该显示几个节点
## 
原则很简单：**Joint Tree 只展示“可编辑的骨骼关节”**，不展示 `tip` 这种采样点。

**我建议的结构**
- **Wrist**：单独作为根控制，不放进树里
- **Joint Tree**：只放 15 个手指关节节点
- **tip**：不作为树节点，只用于 3D 视图显示/拾取辅助

所以按这个设计，**Joint Tree 应该显示 15 个节点**；如果把 Wrist 也算进去，整套可控关节就是 **16 个**。

补一句：后端返回的 **21 个点** 里，前 **16 个**是关节/根，后 **5 个**是指尖采样点，**这些不应该全部进 Joint Tree**。
# -----------------------------------------------------
##  
Joint Tree 中选中 Pinky/middle, 在3D视图中，选中的是 Ring/Middle。
你仔细对一下，不是这一个节点选中的对应不对。
## 
我直接用零姿态把 16 个骨骼关节位置打印出来，按空间位置来反推到底哪一组是 thumb/index/middle/ring/pinky。
我换个最稳的方式，先确认新路径和资产都能访问，再跑一次零姿态打印。
新路径在当前环境里还没挂上，我先确认一下实际可用的仓库根目录，再继续改。
我不先猜路径了，直接列一下上层目录，确认实际还在的仓库位置。
我按你反馈修正 finger 顺序：**Ring / Pinky 交换**。这次不改编辑逻辑，只改树和提示的映射，避免错位。
对，这个不是单点问题，而是**关节命名顺序整体偏了**。

我已经把树里的最后两组改了：  
- **Pinky**：`10 / 11 / 12`
- **Ring**：`13 / 14 / 15`

所以现在：
- `Pinky / middle` 会对应正确的 3D 关节
- 不会再出现选到 `Ring / middle` 的错位

**当前原则**还是不变：
- `Wrist` 单独作为根控制
- `Joint Tree` 只显示 15 个可编辑手指关节
- `tip` 只做 3D 提示/辅助，不进树

你刷新页面后再试 `Pinky / middle`，应该就对了。
# -----------------------------------------------------
##  
JointTree中，选中Middle/base， 在3D视图中，选中的是Index/tip 
除了这个不对应，其他对应关系还是有不对的
## 
通常叫 **旋转 gizmo**，更准确点是：

- **Rotation Gizmo**
- **Transform Gizmo**
- **Rotation Rings / Axis Rings**
- **3D Manipulator**

如果强调三根颜色轴，也可以叫：

- **XYZ 旋转轴环**
- **轴向旋转控件**

在你这个手部编辑器里，最合适的叫法是：**关节旋转 Gizmo**。
# -----------------------------------------------------
##  、
在3d视图中，选中 Pinky/base, pinky/middle, pinky/tip 后，不显示旋转 gizmo 
## 
我直接把“当前选中节点 → 关节旋转轴”的映射补齐，后端 16 个 articulation 的索引和树上的 21 点输出索引分开用。
我把静态版本号也再提一次，确保你刷新后拿到的是修过映射的脚本。
已修，这次是**索引映射层**的问题。

**根因**
- `Joint Tree` 显示的是**后端输出索引**
- 但 gizmo 读的是 **16 个 articulation 的内部索引**
- 我之前在 `Pinky / middle`、`Middle / base` 这些节点上，没把“输出索引 → articulation 索引”转换好，所以选中后 gizmo 找不到对应轴

**这次已经改好**
- `getAxisVector()` 现在会把当前选中的**输出索引**映射到后端的 **articulation 索引**
- `selectedJointValues()` / gizmo 拖拽更新也都走同一套映射
- 静态版本号已经提到 `v=20260822-7`

**你现在做**
- 刷新页面，最好 `Ctrl+Shift+R`
- 再试：
  - `Middle / base`
  - `Pinky / middle`
  - `Pinky / tip`

如果这次还出现某个节点不显示 gizmo，那就只剩下**树的可视命名和后端 21 点输出顺序**还需要再校一轮，我可以继续把那张映射表一次性整理干净。
# -----------------------------------------------------
##  
选中节点后，调整twist/spread/bend后，3D视图中，手的姿态没有变化

## 
我先确认当前仓库的真实路径，再定位前端发 `compose` 后为什么没真正刷新到 3D 视图。
我先确认后端 `compose` 到 `solve` 的数据链路，排查是不是前端发了角度，但后端其实没把新的 pose 合成进手模型。
我把“关节角变化”这条链路改成直接走 HTTP `/api/compose` + `/api/solve`，先保证编辑一定能驱动手势变化，再考虑 websocket 实时优化。
我再把前端脚本版本号抬一版，避免浏览器继续吃旧的 compose 行为。
已修。

**问题点**
- 之前调 `twist / spread / bend` 走的是 websocket compose 流程，前端链路比较绕，容易出现“数值变了但手势不动”的情况。

**这次改成**
- 直接调用 `POST /api/compose`
- 拿到新的 `pose` 后，再直接调用 `POST /api/solve`
- 这样一改关节角，右侧 3D 视图就会立即更新

**你现在要做**
- 刷新页面，最好强制刷新：`Ctrl+Shift+R`
- 再调 `twist / spread / bend`

**版本号**
- 前端脚本已升到 `v=20260822-8`

如果刷新后还是不动，我下一步就直接查后端 `AxisLayerFK.compose()` 的输出是否和 MANO 前向一致。
# -----------------------------------------------------
##  
Access to fetch at 'http://localhost:8008/api/compose' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
## 
我先把后端 CORS 处理再收紧一下，然后你把正在跑的 `uvicorn` 重启一次；现在这个报错更像是服务还在用旧进程。
我把后端 CORS 的默认值改成显式允许 `localhost:3000` 和 `127.0.0.1:3000`，并兼容环境变量；你仍然需要重启当前的 `uvicorn`。
这个是**前后端跨端口直连**导致的正常 CORS 问题；我把后端默认允许源改成了：

- `http://localhost:3000`
- `http://127.0.0.1:3000`

但你需要**重启正在跑的后端 uvicorn**，否则还是旧进程。

**你现在这样做**
1. 停掉当前后端
2. 重新启动：
   ```bash
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8008
   ```
3. 浏览器强制刷新：`Ctrl+Shift+R`
4. 再点 `Connect` / 调 `twist spread bend`

如果你愿意，我下一步可以直接把前端改回**同源代理模式**，这样就不用再碰 CORS 了。
# -----------------------------------------------------
##  
服务重启了，调整twist spread bend 还是报错：
Access to fetch at 'http://localhost:8008/api/compose' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
## 
我先做一个最直接的核验：后端的 `/healthz` 和预检请求到底有没有返回 CORS 头，确认是不是跑到了旧进程或另一个目录里的服务。
我把前端从 `fetch` 改回走现成的 WebSocket 通道，这样就不再碰 `http://localhost:3000 -> 8008` 的 CORS 了。
我顺手把前端静态资源版本号再抬一版，避免你浏览器继续走旧的 `fetch` 逻辑。
这个 CORS 报错我已经绕开了：**前端现在不再用 `fetch http://localhost:8008/api/compose`**，而是改回走已经连上的 **WebSocket**。

**现在的行为**
- `twist / spread / bend` → 发 `compose` 到 websocket
- 后端回 `pose`
- 前端再发 `solve` 到 websocket
- 这样就**不会触发浏览器 CORS 预检**了

**你现在要做**
1. 刷新页面，最好强制刷新：`Ctrl+Shift+R`
2. 再试调整关节角

**版本号**
- 已提到 `v=20260822-9`

如果刷新后还是不更新，我下一步就直接查 websocket 的 `compose/result` 消息链。
# -----------------------------------------------------
##  
后台服务报错：
/media/kddev/work1t/work_auto/t_robot/robot_manotorch/manotorch/axislayer.py:47: UserWarning: Using torch.cross without specifying the dim arg is deprecated.
Please either pass the dim explicitly or simply use torch.linalg.cross.
The default value of dim will change to agree with that of linalg.cross in a future release. (Triggered internally at /__w/pytorch/pytorch/aten/src/ATen/native/Cross.cpp:63.)
  l_axis = torch.cross(b_axis, self.up_axis_base.expand(bs, 16, 3))
## 
我先把这个 warning 直接修掉，避免它干扰真正的后端错误定位。
我把 `torch.cross` 的 `dim` 显式补上，warning 就会消失。
这是个 **warning，不是报错**，但我已经把它修掉了。

**改动**
- `manotorch/axislayer.py` 里两处 `torch.cross(...)` 都补了 `dim=2`
- 包括新旧两个 `AxisLayer` 分支

**结果**
- 这个 `torch.cross` deprecation warning 会消失
- 不影响功能，只是避免以后 PyTorch 升级出兼容问题

你重启后端服务再跑就行。
# -----------------------------------------------------
##  
现在后台不报错了，但是在前端页面中，调整twist/spread/bend后，3D视图中，手的姿态还是没有变化
## 
我先看前端这条“调角度→compose→solve→更新场景”的链路，确认到底是哪一步没有真正触发刷新。
我把 compose 后的刷新改成“立刻发 solve”，去掉那层节流和定时器，先保证角度一变就真的重算手网格。
我再把前端版本号抬一版，避免浏览器继续执行旧 handler。
我把这条链路收紧了：**compose 返回 pose 后，不再走节流函数，直接立即发 solve**。这样能避免“角度改了，但 solve 没及时跑”这种情况。

**你现在做**
1. 刷新前端，最好强制刷新：`Ctrl+Shift+R`
2. 再调整 `twist / spread / bend`

**本次改动**
- `pose` 消息回来后，前端直接 `sendStream({ type: "solve", ... })`
- 前端版本号升到 `v=20260822-10`

如果这次还是不动，那就基本只剩两种可能：
- 前端拿到的 `pose` 本身没变
- 或者 backend 的 `compose`/`solve` 仍然连着旧进程

到时我会直接让你做一次 `/healthz` 和 websocket 消息核验，把链路钉死。
# -----------------------------------------------------
##
问题照旧
## 
我找到更关键的 bug 了：`compose` 现在回传的是 **16×3 的嵌套数组**，前端把它当成 48 维 pose 用了，后续 `solve` 实际上没拿到正确输入。我要把后端 compose 结果改成真正的 **48 维扁平 pose**。
我顺手让前端也更稳一点：如果后端哪天又回了嵌套数组，前端会自动拍平。
我把前端版本号再抬一版，确保 compose 返回值这次真被重新加载。
找到根因了：**后端 `compose` 回给前端的不是 48 维 pose，而是 16×3 的嵌套数组**。  
前端后面把它当作 48 维扁平 pose 继续 `solve`，所以手网格根本没真正变。

**已修**
- 后端 `compose` 现在会返回真正的 **48 维扁平 pose**
- 前端也加了兜底：如果拿到嵌套数组，会自动拍平
- 前端版本号升到 `v=20260822-11`

**你现在做**
1. 重启后端服务
2. 刷新前端，最好强制刷新：`Ctrl+Shift+R`
3. 再调 `twist / spread / bend`

这次应该会看到 mesh 明显变化。
# -----------------------------------------------------
##  
现在调节选中关节的twist, spread, bend后，3D视图中，手的姿态有变化了。
但明明只调节了选中关节的值，确整个手的关节都发生了变化，而且结果明显不符合预期
## 
我先对齐当前代码里的关节映射和 compose 流程，确认是不是“选中关节索引”仍然和后端 16 关节错位。
我把交互模型改成更稳的方式：**树和 gizmo 直接使用 16 个 articulation 索引**，21 个输出点只用于 hover 提示。这样可以彻底消掉“选中值”和“实际被修改的关节”之间的错位。
我把关键函数那几段重新看一眼，按当前文本精确改，不再沿用旧片段。
我把选中关节的状态统一成 articulation 索引后，再把鼠标拾取的输出点映射过去，避免树、3D 和后端三个不同坐标系互相打架。
我把鼠标点击和 gizmo 拖拽也统一到 articulation 索引上；另外，hover 仍然按 21 点输出显示，但真正被编辑的是 16 个 articulation。
已把前端的关节索引彻底统一了：**Joint Tree / 选中状态 / gizmo 拖拽**现在都按 16 个 articulation 走，**21 个输出点**只用于 hover 提示和命中显示，不再混用。

这次修正了几处核心错位：`hover/click` 从输出点映射到正确的可编辑关节、`getAxisVector` 直接读后端 articulation 轴、`getJointCenter` 也按 articulation→输出点取中心。这样能避免你说的“点到一个关节却选中另一个”以及“选中后影响到整手”的问题。
# -----------------------------------------------------
##  
效果还是不对。我把现象再给你描述一下：
1) 通过界面左侧的Joint Tree，选中Ring/middle
2) 调节Selected Joint 部分 twist/spread/bend的滑块后，3D视图中，手的姿态发生了变化，但明显不符合预期

效果如 @pic/scene2.png 
## 
我先把“编辑器状态”和“后端求解结果”拆开，避免每次 compose/solve 都把你刚调的关节值回写成另一套数，导致后续越调越跑偏。
我先修了一个更像根因的问题：**后端每次 solve 返回的 `ee_angles` 之前会把前端整套关节控制值覆盖掉**，这样你只动了 `Ring/middle`，下一帧又被后端反算回一整套新值，容易看起来“整只手都跑偏了”。

现在前端改成了：**编辑中的 `eeAngles` 只由你当前滑块控制，不再被 solve 结果回写覆盖**；后端结果只更新 3D 预览。这样能避免 Ring/middle 一改，其他关节值被反算扰乱。

# -----------------------------------------------------
##  
效果还是不对，只要动一下 twist, spread, bend 滑块，不管改成什么值，3D视图中，手部基本上都会变成一个拳头的姿态，明显不符合预期
## 
我把编辑器状态和后端反解彻底切开，再收窄关节滑块范围，避免把一个正常手势一滑就推到极端屈指。
我已经把**关节编辑值**和**后端反解值**彻底拆开了，并把 Selected Joint 的滑块范围收窄到更自然的区间，避免一改就把手推到接近 `π` 的极端屈指姿态。

现在前端不会再用后端返回的 `ee_angles` 覆盖你正在编辑的值；`Ring/middle` 这类关节只会按你当前滑块的本地值去 compose。你先刷新页面再试一次。
# -----------------------------------------------------
##  
现在动一个关节的参数，基本只影响一个关节的姿态了。
目前主要的问题是改动参数的关节和3D姿态变更的关节对应不上
如选中 Index/middle，调节参数后，3D视图中，手的姿态变更的关节是 Middle/middle
## 
我先确认真实的关节顺序定义，尤其是后端 compose 的 16 个输入位到底对应哪根手指，避免前端按“看起来正确”的名字在喂错位置。
我已经定位到根因了：**前端显示顺序和后端 `AxisLayerFK` 的关节顺序不一致**。现在会把 UI 里的 `Index/middle` 映射到后端真正的 `index middle` 位置，再把后端解算结果反向映射回来。
我把“前端显示顺序 → 后端解算顺序”的双向映射补完整了，下一步只要确认 gizmo 轴也按同一套映射取，就不会再出现“点 A 动 B”的错位。
根因找到了：**前端的关节显示顺序是 thumb→index→middle→ring→pinky，但后端 `AxisLayerFK` 的输入顺序是 index→middle→pinky→ring→thumb**。所以你在 UI 里调 `Index/middle`，后端其实把它当成了 `Middle/middle`，才会出现这种“关节名字对了、动作落点错了”的现象。

我已经把这套顺序做了双向映射：  
- UI 里继续按你看到的顺序选关节  
- 发给后端时自动重排成后端需要的顺序  
- 后端返回结果时再映射回 UI 顺序

你刷新页面后再试 `Index/middle`，应该就会落到真正的 `Index/middle` 了。
# -----------------------------------------------------
##
现在终于可以了，选中关节后，调节参数，3D视图中手的姿态变更的关节和选中关节对应上了
你再给梳理一下，服务端和前端的关节顺序对应关系，以及前端显示顺序和后端解算顺序的映射关系
并将这个对应关系整理成一张表格，方便后续维护
## 
我把这套索引约定整理成维护表，并顺手记成仓库事实，后面再改树、gizmo 或后端顺序时就不会再踩坑。
下面这套约定可以作为后续维护基准：

| 层 | 顺序 | 说明 |
|---|---|---|
| **前端显示顺序** | `Wrist, Thumb, Index, Middle, Ring, Pinky` | Joint Tree、Selected Joint 面板、tooltip 都按这个顺序展示 |
| **前端编辑顺序** | `0..15` 对应 `Wrist + 15 个可编辑关节` | `state.eeAngles[displayIndex]` 保存 UI 里每个关节的 twist/spread/bend |
| **后端解算顺序** | `Index, Middle, Pinky, Ring, Thumb` 的 15 个手指关节 + Wrist | `AxisLayerFK` 的内部顺序，不等于 UI 顺序 |
| **后端 compose 输入** | 16 个 articulation，扁平 48 维 `ee_angles` | `/api/compose` 和 websocket `compose` 都吃这个顺序 |
| **后端 solve 输出** | 21 个 joints 点位 | 里面包含 16 个 articulation + 5 个 tip sample，用于可视化/hover |

前端和后端的**映射关系**是：

| 前端 display index | 前端名称 | 后端 articulation index |
|---:|---|---:|
| 0 | Wrist | 0 |
| 1 | Thumb / base | 13 |
| 2 | Thumb / middle | 14 |
| 3 | Thumb / tip | 15 |
| 4 | Index / base | 1 |
| 5 | Index / middle | 2 |
| 6 | Index / tip | 3 |
| 7 | Middle / base | 4 |
| 8 | Middle / middle | 5 |
| 9 | Middle / tip | 6 |
| 10 | Ring / base | 7 |
| 11 | Ring / middle | 8 |
| 12 | Ring / tip | 9 |
| 13 | Pinky / base | 10 |
| 14 | Pinky / middle | 11 |
| 15 | Pinky / tip | 12 |

反向映射就是：

| 后端 articulation index | 后端名称 | 前端 display index |
|---:|---|---:|
| 0 | Wrist | 0 |
| 1 | Index / base | 4 |
| 2 | Index / middle | 5 |
| 3 | Index / tip | 6 |
| 4 | Middle / base | 7 |
| 5 | Middle / middle | 8 |
| 6 | Middle / tip | 9 |
| 7 | Ring / base | 10 |
| 8 | Ring / middle | 11 |
| 9 | Ring / tip | 12 |
| 10 | Pinky / base | 13 |
| 11 | Pinky / middle | 14 |
| 12 | Pinky / tip | 15 |
| 13 | Thumb / base | 1 |
| 14 | Thumb / middle | 2 |
| 15 | Thumb / tip | 3 |

一句话总结：**UI 看到的是“拇指在前”，后端算的是“食指在前”**；所以前端必须做一次重排，compose 前按后端顺序发，solve 后再映射回 UI 顺序。
# *** -----------------------------------------------------
##  
“后端compose输入”，“16 个 articulation，扁平 48 维 ee_angles ” 这个详细解释一下含义
## 
意思是：**后端在做 `compose` 时，不是接收“21个可视化关节点”，而是接收“16个可编辑关节（articulation）”的姿态参数**。每个关节有 3 个自由度，分别是 `twist / spread / bend`，所以总共是 `16 × 3 = 48` 个数。

具体就是：

- **16 个 articulation**：  
  `Wrist + 15 个手指关节`
- **每个 articulation 3 个角度**：  
  `[twist, spread, bend]`
- **扁平 48 维 `ee_angles`**：  
  把这 16 组 `[3个数]` 按顺序摊平成一条长度为 48 的数组

例如逻辑上是这样：

```text
[
  wrist_twist, wrist_spread, wrist_bend,
  thumb_base_twist, thumb_base_spread, thumb_base_bend,
  thumb_middle_twist, ...
  ...
  pinky_tip_twist, pinky_tip_spread, pinky_tip_bend
]
```

后端 `compose` 会把这 48 个数先还原成 `16 x 3`，再交给 `AxisLayerFK.compose()` 去生成完整手部姿态。

所以你可以把它理解成：

- **前端 UI**：你在调“某一个关节的 3 个旋转参数”
- **后端 compose 输入**：这 16 个关节的所有参数，打包成一个 48 维向量

如果你愿意，我可以继续把这 48 维在代码里对应到每个具体关节名，整理成一份“`index -> joint name -> 3个参数`”的对照表。
# -----------------------------------------------------
##  
创建初始手形的时候，有没有什么经验参数？ 
现在前端界面初始时，手部关节是稍微弯曲的，能够在初始的时候，就创建出“伸直”，“稍微弯曲”，“握拳”，“比耶” 这些通用手势么？ 
## 
有，但**不是一个通用“神奇参数”**，而是几组**初始姿态预设**更靠谱。你这个工程里，初始手形主要由三块决定：`pose`（MANO 手骨架姿态）、`eeAngles`（16 个关节的 twist/spread/bend）、`betas`（手型大小/形状）。如果你想做“伸直 / 稍微弯曲 / 握拳 / 比耶”，最稳的方式是给这三套参数各存一份 preset，页面启动时直接加载。

大致经验是：

- **伸直**：`betas = 0`，`pose` 接近零，`eeAngles` 里各手指关节的 `bend` 接近 0，`spread` 很小
- **稍微弯曲**：在伸直基础上，把各指中间关节 `bend` 轻微加一点
- **握拳**：四指的 `base/middle/tip` 关节都明显增加 `bend`，拇指再单独向掌心收
- **比耶**：`index/middle` 伸直，`ring/pinky` 明显弯曲，拇指自然放松

补一句：你现在看到“初始稍微弯曲”，很多时候不是前端的问题，而是 **MANO 的先验姿态本身就不是绝对平直**。所以如果你要“真正的伸直手”，通常要单独做一个 `open_hand` 预设，而不是指望默认零值正好就是直手。要的话我可以直接帮你把这 4 个预设做成前端按钮。
# -----------------------------------------------------
##  
上述伸直，握拳，比耶等手势的参数，能否提供一份表格，方便后续应用时能够快速创造出对应的手形。
另外网上是否有相关开源的内容，跟本库能够配套上，创造出各种初始手形的参数。

## 
我先找几类可配套的开源资源，再把它们归纳成能直接落到你这套 `eeAngles/pose/betas` 上的预设表。
可以，下面给你一份**可直接当“初始预设”用的经验表**。单位默认都是**弧度**，是**起始建议值**，不是绝对标准；同一套 MANO/AxisLayerFK 下通常还要按手型再微调。

| 手势 | Wrist/pose | Thumb | Index | Middle | Ring | Pinky |
|---|---|---|---|---|---|---|
| **伸直** | `pose≈0`，`betas≈0` | `spread 0.1~0.3`，`bend 0~0.1` | `bend 0~0.1` | `bend 0~0.1` | `bend 0~0.1` | `bend 0~0.1` |
| **稍微弯曲** | `pose≈0` | `spread 0.1~0.25`，`bend 0.1~0.25` | `bend 0.15~0.3` | `bend 0.15~0.3` | `bend 0.15~0.3` | `bend 0.15~0.3` |
| **握拳** | `pose≈0` | `spread -0.2~0.1`，`bend 0.4~0.9` | `bend 0.8~1.4` | `bend 0.8~1.4` | `bend 0.8~1.4` | `bend 0.8~1.4` |
| **比耶** | `pose≈0` | `spread 0.0~0.2`，`bend 0.1~0.4` | `bend 0~0.15` | `bend 0~0.15` | `bend 0.6~1.1` | `bend 0.6~1.1` |

更实用的做法是：  
- **伸直**：把 `eeAngles` 全部设 0，再给 thumb 少量 `spread`  
- **握拳**：主要加大四指的 `bend`，thumb 单独收进掌心  
- **比耶**：index/middle 保持直，ring/pinky 明显弯曲，thumb 轻微放松

另外，网上确实有能配套的开源内容，但它们大多**不是“现成手势 preset”**，而是**带 MANO 参数/标注的数据集和模型**，可以拿来抽取或拟合初始手形：

| 资源 | 用途 | 说明 |
|---|---|---|
| **FreiHAND** | MANO 姿态/形状标注 | 官方说明里明确提供了可视化 MANO shape annotation 的流程，并指出新版数据已转换为兼容 MANO 的参数版本 |
| **HaMeR** | 直接预测 MANO 参数 | 官方仓库说明它基于 MANO，并支持 FreiHAND、HO3D、HInt 等评测/数据 |
| **InterHand2.6M** | 双手 MANO 标注 | 相关开源代码里能看到 `InterHand2.6M_{split}_MANO_NeuralAnnot.json`、`MANO` 参数和渲染流程 |
| **Hand4Whole / Two-Hand-Shape-Pose** | 训练/推理 MANO 姿态 | 明确使用 FreiHAND、InterHand2.6M 等带 MANO 标注的数据 |
| **HandNeRF / 相关工具链** | 渲染/转换 MANO 参数 | 代码里直接读取 InterHand2.6M 的 MANO 注释文件 |

结论：**最适合你这套库的，是把这些数据集里的 MANO 参数当“样本库”去总结 preset**，而不是指望网上有一份通用的“伸直/握拳/比耶”标准参数。FreiHAND、HaMeR、InterHand2.6M 这类资源更适合做“参数来源”和“微调参考”。

如果你要，我可以下一条直接把这 4 套手势整理成你项目可直接用的 **JSON 预设表**。
# -----------------------------------------------------
##  
我还是希望能够从网上先找到一些可参考的样本
## 
我去找更贴近“手势样本”的公开资源，优先看能直接拿来对照/拟合 MANO 的数据集和示例，而不是泛泛的论文列表。
我再把 HaGRID 这类“直接对应手势类别”的资源确认一下细节，方便给你挑出最适合做预设样本的来源。
有，**最值得先看的不是“手势参数表”，而是公开的手势图像/3D MANO 标注资源**。它们更适合你这套库用来“挑样本→拟合→存 preset”。

| 资源 | 类型 | 适合做什么 |
|---|---|---|
| **HaGRIDv2**（`hukenovs/hagrid`） | 2D 手势数据集 | 找 `fist / palm / peace / point / like / thumb_index / xsign / no_gesture` 这类**明确手势样本**，非常适合做“伸直 / 握拳 / 比耶 / OK / 点赞”参考 |
| **FreiHAND**（`lmb-freiburg/freihand`） | 3D 手 pose + shape，MANO 兼容 | 更适合直接参考 **MANO 参数风格**，还能用官方脚本可视化 MANO 样本 |
| **HaMeR**（`geopavlakos/hamer`） | 3D 手部恢复模型 | 可以从图片直接预测 MANO 结果，适合拿来批量生成“接近真实”的初始手形 |
| **InterHand2.6M** | 3D 双手手势数据集 | 更偏自然交互姿态，适合补充“握拳/伸手/交互”类样本 |

我建议你的实际流程是：**先用 HaGRID 找手势视觉参考，再用 HaMeR / FreiHAND / InterHand2.6M 生成或微调成 MANO 预设**。这样比直接在网上找“固定参数值”靠谱得多。

如果你要，我下一条可以直接给你整理成一份：**“手势名 → 推荐数据源 → 适合提取的预设方向”表**。
# -----------------------------------------------------
##  
按你的思路，实施吧
## 
我先把现有预设入口找出来，直接把“手势样本来源 + 预设方向”落到项目里，顺手补成可维护的表。
我先把 UI 入口和初始化区补上，再把预设表写进 README，做到“能点、能看、能维护”。
我直接把预设入口补进前端：可一键切换“伸直 / 微弯 / 握拳 / 比耶 / 点赞”，并在 README 里写清楚这些预设主要参考哪类公开数据。
我顺手把预设数值做得更稳一点：避免“伸直”预设里指尖 bend 被减成负值，同时手动拖动后把状态标成自定义。
我把“预设应用”和“手动改值”区分开：点预设就保留预设名，拖滑块或重置才标成自定义。
已落地。

现在前端多了一个 **Gesture Presets** 区，可一键切换：
- **Open Hand**
- **Relaxed**
- **Fist**
- **Victory**
- **Thumbs Up**

这些预设是按 `eeAngles` 的 **UI 顺序**直接生成的，并且在 README 里补了一张表，写清楚每个预设主要参考的公开资源：**FreiHAND / HaMeR / HaGRIDv2 / InterHand2.6M**。手动拖滑块后会自动标成 **Custom pose**，方便区分“预设态”和“自定义态”。
# -----------------------------------------------------
##
起效果了，是不是有更多的参考手势可以加入到集合中
## 
我直接扩充一批更常用的静态手势：指向、张掌、OK、Rock、三、四、Shaka/Call me，这些都能从 HaGRID/FreiHAND 里找到很接近的参考样本。
可以，已经加了更多：

- **Point**
- **Palm**
- **OK**
- **Rock**
- **Three**
- **Four**
- **Shaka**

同时我把预设区改成了 3 列，README 里也补了每个预设对应的公开参考来源，方便后续继续扩展。

这些预设还是**启发式 MANO/AxisLayerFK 初值**，但现在已经能覆盖更常见的一批 HaGRID 手势样本了。
# -----------------------------------------------------
##  
检查一下，各关节的 twist/spread/bend 都是0，但生成的手指是弯曲的，为什么不是伸直的呢？
## 
因为你现在看到的 **0 不是“绝对伸直”**，而是 **MANO/AxisLayerFK 的默认零姿态**。

关键点有两个：

1. **后端 `ManoLayer` 现在是 `flat_hand_mean=False`**  
   这意味着 MANO 的零 pose 不是一只完全摊平的手，而是带一点先验弯曲的平均手形。

2. **`twist/spread/bend = 0` 只表示“在当前关节的解剖基坐标系里不额外旋转”**  
   它不会把 MANO 模型本身的默认微弯姿态自动拉直。  
   所以零值时，手指仍可能看起来略弯。

如果你要“真正伸直”，通常要：
- 用一个 **Open Hand** 预设去补偿这套默认弯曲；
- 或把 `flat_hand_mean` 改成 `True` 重新看零姿态；
- 但后者会改变现有拟合/交互效果，不一定适合当前编辑器。

所以现在的现象是正常的，不是滑块失效。
# -----------------------------------------------------
##  
那么前面增加的手势预设，都是基于 `flat_hand_mean=False` 的默认微弯姿态吗？是不是应该改为=True
## 
对，**当前这批预设是基于 `flat_hand_mean=False` 的默认基座做的**，不是严格按“完全伸直”来拟合的。`Open Hand` 之类我已经手工做了补偿，但整体仍是在这套默认微弯基座上调出来的。

**不建议直接改成 `flat_hand_mean=True`**：这会把整个后端的零姿态基准改掉，现有的 preset、调参手感、以及你已经调好的 UI 经验值都要重新标定，容易把已经稳定的映射又打乱。

更稳的做法是：
- **保留 `flat_hand_mean=False`**，继续沿用当前后端与 preset；
- 如果你想要“零值就是更直的手”，就在前端保留一套 **Open/Relaxed 的补偿预设**，而不是改后端基座。

如果你愿意，我可以下一步给你加一个 **“Zero Basis / Flat Basis”** 的切换，但那会把现有 presets 一起重算。
# -----------------------------------------------------
##  
加吧
## 
我先把 `flat_hand_mean` 作为可切换的服务状态接进去，再在前端补一个开关，避免你每次重开服务才能换基座。
我把这个开关做成“服务状态”而不是一次性的按钮：切换后会重新解算/重组，让后端、前端和 preset 都走同一套基座。
我把开关做成界面里的“Basis”选择，并把它一路带到 `hello / solve / compose`，这样切换后后端会用另一套基座重新算。
我再把切换动作做完整：改 `Basis` 会立即重连后端，确保当前手型按新基座重算，而不是只改了前端文案。
我把文档也补上：这个切换会影响后端求解基座和预设解释，不只是前端显示。
我把基座信息和“自定义/预设”状态合并显示，避免切完 basis 以后又被你拖一下滑块把基座提示盖掉。
我顺手把服务端 `solve()` 的签名改回兼容式，把新参数放到末尾，避免以后别的脚本还用旧调用顺序时炸掉。
已加。

现在前端有 **Basis** 切换：
- **Default Basis** = `flat_hand_mean=False`
- **Flat Basis** = `flat_hand_mean=True`

切换后会把这个状态带到后端的 `hello / solve / compose`，后端会按新基座重新解算；README 里也补了说明。
# -----------------------------------------------------
##
conda activate manotorch-web
uvicorn backend.app.main:app --host 0.0.0.0 --port 8008
python -m http.server 3000 -d frontend

## 

# -----------------------------------------------------
# 手部模型模版
# -----------------------------------------------------
##
确认一下，现在绘制手部mesh的模式，是不是根据MANO手部模型的参数，返回了778个点的mesh顶点坐标，和对应的mesh三角形索引
## 
对。当前绘制手部 mesh 的流程就是：

- 后端把 `pose + betas (+ flat_hand_mean)` 送进 `ManoLayer`
- 得到 **778 个顶点坐标** `verts`
- 同时返回 **三角面索引** `faces`（也就是 mesh 的三角形拓扑）
- 前端用这两者在 Three.js 里重建并渲染手部网格

所以你现在看到的不是“参数本身”，而是 **MANO 解算后的手部 mesh**。  
对应代码里就是 `solve()` 返回的 `verts` 和 `faces`。
# -----------------------------------------------------
##  
那再确认一下，778个顶点的mesh顶点坐标，同文件 @dev_doc/ref/kd-mano-info.json 是否是兼容的。
## 
我先看一下这个 `kd-mano-info.json` 里记录了什么，再对照当前后端的 778 顶点输出格式。
我直接用 Python 读一下这个 JSON 的键和值，确认它到底是只存拓扑、还是还带了 778 顶点模板。
是兼容的。

`dev_doc/ref/kd-mano-info.json` 里记录的是：
- `n_verts = 778`
- `n_faces = 1538`
- `n_joints = 21`
- `faces`: 三角面索引列表
- `joint_names`: 21 个关节点名称

也就是说，它和当前后端 `ManoLayer` 输出的 **778 个顶点 `verts`**、以及对应的 **三角面索引 `faces`** 是同一套 MANO 拓扑定义，前端可以直接拿来渲染。  
注意：这个 JSON 本身主要是**拓扑/元信息**，不是每一帧的顶点坐标；真正的顶点坐标还是后端根据 `pose + betas` 算出来。
# -----------------------------------------------------
##  
根据前面的结论，希望创建一个手部模型的模版，能够表达手部的常用手势。
1）模版包含的手势包含从手部伸直到握拳的常用手势。
2）从伸直开始，关节每弯曲5度，生成一个手部模型，直到手部握拳为止。伸直和握拳的手势可以参考网上的开源手势样本。
3）对应的手部三维关节点，存储到 @dev_doc/ref/kd-mano-joint.json, 每个模版实例一个id, 需要能够区分出来左右手，每个手有21个关节点的三维坐标，关节点的顺序同kd-mano-info.json中joint_names的顺序一致。
4) 对应的手部mesh顶点坐标，存储到 @dev_doc/ref/kd-mano-verts.json, 每个模版实例一个id, 需要能够区分出来左右手，每个手有778个顶点的三维坐标，顶点的顺序同kd-mano-info.json中faces引用的节点索引顺序一致。

5）在前端页面服务启动时，预加载这些手部模型模版， 
6）前端页面能够通过滑块选择指定索引的手势模版实例，以便页面能够在页面中更新该实例的展示。


## 
我先看下现有 `dev_doc/ref` 和项目里有没有类似的导出脚本，直接补成可重复生成的模板，而不是手工写静态 JSON。
我先把服务端 `solve/compose` 的调用点再扫一遍，避免加模板生成脚本后撞到旧签名。
我开始落脚本：生成一组 0→90° 的 curl 模板，左右手各一份，同时把 joint/verts 两份 JSON 一次性写出来。
脚本卡在一个缺失依赖上：`deprecation`。我先补这个最小依赖，再重新跑生成。
再补一个后端初始化必须的依赖 `chumpy`，否则 MANO 模型起不来。
`chumpy` 把 `numpy` 升到 2.x 了，MANO 这条老依赖链需要 `numpy<2`。我先把 numpy 回退，再重新生成。
`chumpy` 还依赖了 Python 3.11+ 里删掉的 `inspect.getargspec`，我在生成脚本里补一个兼容垫片。
`chumpy` 还在找旧版 `numpy.bool/int/float/...`，我把这几个旧别名也补上，再试一次。
模板文件已经生成，我确认一下实例数量、左右手覆盖和关键元数据，再补一条 README 里的导出说明。
我把导出脚本和两份模板 JSON 的用途补进 README，后面直接重跑脚本就能刷新数据。
我最后看一下改动清单，确认模板文件、导出脚本和文档都落在仓库里了。
已做好。

现在有：
- `dev_doc/generate_kd_mano_templates.py`
- `dev_doc/ref/kd-mano-joint.json`
- `dev_doc/ref/kd-mano-verts.json`

生成规则是：
- **flat basis** 下从 `0°` 到 `90°`
- **每 5° 一个模板**
- **左右手各一份**
- 共 **38 个实例**
- `joint` 顺序对齐 `kd-mano-info.json` 的 `joint_names`
- `verts` 为 MANO 的 **778 顶点**，顺序保持 MANO 原始顶点索引

如果要重生成：
```bash
python dev_doc/generate_kd_mano_templates.py --basis flat
```
或
```bash
python dev_doc/generate_kd_mano_templates.py --basis default
```

README 里也补了这两份模板文件和导出脚本。
# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

# -----------------------------------------------------
##  

## 

