
interface Vec2 {
	x: number
	y: number
}

interface ProgramType {
	name: string
	desc: string
	color: string
	icon: string
	cost: number
	size: number
	moves: number
	actions: Action[]
}

interface Action {
	name: string
	type: ActionType
	power: number
	range: number
	minSize: number
	cost: number
}

interface ProgramData {
	type: ProgramType
	body: Vec2[]
	mine?: boolean
}

interface Level {
	type: LevelType
	bg: string
	reward: number
	programs: ProgramData[]
	map: CellType[]
}

interface Program {
	type: ProgramType
	body: Vec2[]
	moves: number
	mine: boolean
	done: boolean
	initialMoves: number
	initialBody: Vec2[]
}

interface PathNode {
	x: number
	y: number
	d: number
	p: PathNode | null
}

interface World {
	servers: (WaypointServer | BattleServer | ShopServer)[]
	links: Link[]
}

interface Server {
	name: string
	desc: string
	x: number
	y: number
	type: ServerType
}

interface Link {
	pts: Vec2[]
}

interface WaypointServer extends Server {
	type: ServerType.Waypoint
}

interface BattleServer extends Server {
	type: ServerType.Battle
	level: Level
}

interface ShopServer extends Server {
	type: ServerType.Shop
	stock: ProgramType[]
}

interface Save {
	programs: ProgramType[]
	servers: boolean[]
	money: number
}

const enum ActionType {
	None = 0,
	Attack = 1
}

const enum CellType {
	None = 0,
	Empty = 1,
	Spawn = 2,
	Flag = 3
}

const enum OverlayType {
	Move = 0,
	Attack = 1,
	Effect = 2
}

const enum LevelType {
	Delete = 0,
	Retrieve = 1
}

const enum ServerType {
	Waypoint = 0,
	Battle = 1,
	Shop = 2
}

const enum Phase {
	World = 0,
	Setup = 1,
	Player = 2,
	PlayerAct = 3,
	Enemy = 4,
	EnemyAct = 5,
	Victory = 6,
	Loss = 7
}

class Track {
	static tracks: Track[] = []
	static current: Track | null = null
	static playWhenReady: Track | null = null

	buffer: AudioBuffer | null = null
	src: AudioBufferSourceNode | null = null
	gain: GainNode
	private disconnectTimeout: number | null = null

	constructor(public url: string) {
		this.gain = actx.createGain()
		this.gain.connect(actx.destination)
		loadSound(url, buff => {
			this.buffer = buff
			if (this == Track.playWhenReady) this.play()
		})
		Track.tracks.push(this)
	}

	isReady(): boolean {
		return this.buffer != null
	}

	play(): void {
		if (this.isReady()) {
			Track.current = this
			for (let track of Track.tracks) {
				if (track != this) track.stop()
			}
			if (this.disconnectTimeout) clearTimeout(this.disconnectTimeout)
			if (!this.src) {
				this.src = playSound(this.buffer, this.gain)
				if (this.src) this.src.loop = true
			}
			this.gain.gain.linearRampToValueAtTime(.5, actx.currentTime + 0.5)
		} else {
			Track.playWhenReady = this
		}
	}

	pause(): void {
		this.gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.5)
	}

	resume(): void {
		this.gain.gain.linearRampToValueAtTime(.5, actx.currentTime + 0.5)
	}

	stop(): void {
		if (this == Track.playWhenReady) Track.playWhenReady = null
		this.gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.5)
		this.disconnectTimeout = setTimeout(() => {
			if (this.src) {
				this.src.stop()
				this.src.disconnect()
				this.src = null
			}
		}, 500)
	}
}

function loadSound(url: string, cb: (buffer: AudioBuffer) => void): void {
	let req = new XMLHttpRequest()
	req.open('GET', url, true)
	req.responseType = 'arraybuffer'
	req.onload = () => {
		actx.decodeAudioData(req.response, cb, err => console.log(err))
	}
	req.send()
}

function playSound(buffer: AudioBuffer | null, dest?: AudioNode): AudioBufferSourceNode | null {
	if (!buffer) return null
	let src = actx.createBufferSource()
	src.buffer = buffer
	if (dest) {
		src.connect(dest)
	} else {
		src.connect(actx.destination)
	}
	src.start(0)
	return src
}

function dist(a: Vec2, b: Vec2): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function isEmpty(v: Vec2): boolean {
	return map[v.y * GRID_WIDTH + v.x] != CellType.None && !programs.some(p => p.body.some(b => b.x == v.x && b.y == v.y))
}

function neighbors(v: Vec2): Vec2[] {
	return [
		{ x: v.x - 1, y: v.y },
		{ x: v.x + 1, y: v.y },
		{ x: v.x, y: v.y - 1 },
		{ x: v.x, y: v.y + 1 }
	]
}

function filteredNeighbors(v: PathNode, filter: (v: Vec2) => boolean, exclude: PathNode[]): PathNode[] {
	let result: PathNode[] = []
	let ns = neighbors(v).filter(n => filter(n))
	for (let n of ns) {
		let existing = exclude.find(e => e.x == n.x && e.y == n.y)
		if (existing && existing.d >= v.d + 1) {
			existing.d = v.d + 1
			existing.p = v
			result.push(existing)
		}
		else {
			result.push({ ...n, d: v.d + 1, p: v })
		}
	}
	return result
}

function getMoves(p: Program, ignoreDistance: boolean = false): PathNode[] {
	let head = { ...p.body[0], d: 0, p: null }
	let frontier: PathNode[] = []
	let closed: PathNode[] = []
	frontier.push(...filteredNeighbors(head, n => isEmpty(n), closed))
	while (frontier.length > 0) {
		let v = frontier.pop()!
		if (!closed.some(c => c.x == v.x && c.y == v.y)) {
			closed.push(v)
		}
		if ((ignoreDistance && v.d < MAX_PATH_LEN) || v.d < p.moves) {
			frontier.push(...filteredNeighbors(v, n => isEmpty(n), closed))
		}
	}
	return closed
}

function getTargets(p: Program, a: Action): PathNode[] {
	let head = { ...p.body[0], d: 0, p: null }
	let frontier: PathNode[] = []
	let closed: PathNode[] = []
	frontier.push(...filteredNeighbors(head, n => true, closed))
	while (frontier.length > 0) {
		let v = frontier.pop()!
		if (!closed.some(c => c.x == v.x && c.y == v.y)) closed.push(v)
		if (v.d < a.range) frontier.push(...filteredNeighbors(v, n => true, closed))
	}
	return closed.filter(n => programs.some(r => r.body.some(b => b.x == n.x && b.y == n.y)))
}

function loadProgram(p: ProgramData): Program {
	return { mine: false, ...p, body: p.body.map(v => ({ ...v })), moves: p.type.moves, done: false, initialMoves: p.type.moves, initialBody: p.body.map(v => ({ ...v })) }
}

function loadLevel(index: number): void {
	let svr = (WORLD.servers[index] as BattleServer)
	server = svr
	let lvl = svr.level
	storage = [...save.programs]
	programs = lvl.programs.map(v => loadProgram(v))
	map = [...lvl.map]
	level = lvl
	changePhase(Phase.Setup)
	battleTracks[Math.floor(Math.random() * battleTracks.length)].play()
	render()
}

function remove(index: number): void {
	storage.push(programs[index].type)
	programs.splice(index, 1)
	selected = null
	selectedAction = null
	render()
}

function place(x: number, y: number, index: number): void {
	let t = storage[index]
	storage.splice(index, 1)
	let p = loadProgram({ type: t, body: [{ x, y }], mine: true })
	programs.push(p)
	hidePopup()
	select(programs.length - 1)
}

function select(index: number): void {
	if (programs[index] == selected) return
	if (selected && !selected.done && selected.moves != selected.initialMoves) {
		pass(programs.indexOf(selected))
	}
	selected = programs[index]
	selectedAction = null
	render()
}

function move(index: number, x: number, y: number): void {
	let p = programs[index]
	if (!p.done && p.moves > 0 && isEmpty({ x, y })) {
		playSound(soundBufferMove)
		p.body.unshift({ x, y })
		if (p.body.length > p.type.size) p.body.pop()
		p.moves--
		if (p.mine && map[y * GRID_WIDTH + x] == CellType.Flag) {
			map[y * GRID_WIDTH + x] = CellType.Empty
			playSound(soundBufferPickup)
			showPopup(1000, 'File retrieved!')
		}
		render()
	}
}

function cancel(index: number): void {
	let p = programs[index]
	if (!p.done && p.moves != p.initialMoves) {
		p.moves = p.initialMoves
		p.body = p.initialBody.map(v => ({ ...v }))
		selectedAction = null
		render()
	} else if (selected) {
		selected = null
		selectedAction = null
		render()
	}
}

function pass(index: number): void {
	let p = programs[index]
	if (!p.done) {
		p.done = true
		selected = null
		selectedAction = null
		render()
	}
}

function selectAction(index: number): void {
	if (selected) {
		let a = selected.type.actions[index]
		if (a != selectedAction && selected.body.length >= a.minSize) {
			playSound(soundBufferTarget)
			selectedAction = a
			render()
		}
	}
}

function act(pIndex: number, aIndex: number, x: number, y: number): void {
	let p = programs[pIndex]
	let a = p.type.actions[aIndex]

	pass(pIndex)

	if (phase == Phase.Player) phase = Phase.PlayerAct
	if (phase == Phase.Enemy) phase = Phase.EnemyAct

	if (a.type == ActionType.Attack) {
		let t = programs.find(v => v.body.some(b => b.x == x && b.y == y))
		if (t) {
			let dmg = Math.min(t.body.length, a.power)
			for (let d = 1; d <= dmg; d++) {
				setTimeout(() => {
					playSound(soundBufferHit)
					if (t) t.body.pop()
					programs = programs.filter(v => v.body.length > 0)
					render()
				}, 200 * d)
				setTimeout(() => {
					if (phase == Phase.PlayerAct) phase = Phase.Player
					if (phase == Phase.EnemyAct) phase = Phase.Enemy
					render()
				}, 200 * dmg)
			}
		}
	}
	render()
}

function resetPrograms(): void {
	for (let p of programs) {
		p.done = false
		p.initialMoves = p.type.moves
		p.initialBody = p.body.map(v => ({ ...v }))
		p.moves = p.initialMoves
	}
	render()
}

function showStorage(x: number, y: number): void {
	let out = ''
	let counts: { [key: string]: number } = {}
	let types: { [key: string]: ProgramType } = {}
	for (let p of storage) {
		if (!counts[p.name]) counts[p.name] = 0
		counts[p.name]++
		if (!types[p.name]) types[p.name] = p
	}
	for (let key in counts) {
		let index = storage.indexOf(types[key])
		out += div('popup-button', `${key} x${counts[key]}`, `place(${x},${y},${index})`)
	}
	showPopup(Infinity, 'Select Program', out)
}

function showShop(index: number): void {
	let svr = WORLD.servers[index] as ShopServer
	server = svr
	save.servers[index] = true
	let out = ''
	out += div('popup-desc', 'Shop')
	for (let item of svr.stock) {
		let itemIndex = svr.stock.indexOf(item)
		out += div('popup-button', `${item.name} (${item.cost})`, `selectShopItem(${itemIndex})`)
	}
	out += div('popup-desc', 'Inventory')

	let counts: { [key: string]: number } = {}
	let types: { [key: string]: ProgramType } = {}
	for (let p of save.programs) {
		if (!counts[p.name]) counts[p.name] = 0
		counts[p.name]++
		if (!types[p.name]) types[p.name] = p
	}
	for (let key in counts) {
		let itemIndex = save.programs.indexOf(types[key])
		out += div('popup-button', `${key} x${counts[key]}`, `selectStorageItem(${itemIndex})`)
	}
	showPopup(Infinity, svr.name, out)
}

function exitShop(): void {
	selectedItem = null
	server = null
	hidePopup()
}

function selectShopItem(index: number): void {
	selectedItem = (server as ShopServer).stock[index]
	render()
}

function selectStorageItem(index: number): void {
	selectedItem = save.programs[index]
	render()
}

function purchase(index: number): void {
	let item = (server as ShopServer).stock[index]
	if (save.money >= item.cost) {
		save.money -= item.cost
		save.programs.push(item)
		playSound(soundBufferPurchase)
		if (server) showShop(WORLD.servers.indexOf(server))
	}
}

function sell(index: number): void {
	let item = save.programs[index]
	save.money += item.cost / 2
	save.programs.splice(index, 1)
	playSound(soundBufferPurchase)
	if (server) showShop(WORLD.servers.indexOf(server))
}

function showServer(index: number): void {
	let svr = WORLD.servers[index]
	if (svr.type == ServerType.Waypoint) {
		showPopup(Infinity, svr.name, div('popup-desc', svr.desc) + div('popup-button', 'Exit', `hidePopup()`))
	}
	if (svr.type == ServerType.Battle) {
		showPopup(Infinity, svr.name, div('popup-desc', svr.desc) + div('popup-row', div('popup-button', 'Cancel', `hidePopup()`) + div('popup-button', 'Battle', `loadLevel(${index})`)))
	}
	if (svr.type == ServerType.Shop) {
		showPopup(Infinity, svr.name, div('popup-desc', svr.desc) + div('popup-row', div('popup-button', 'Cancel', `hidePopup()`) + div('popup-button', 'Shop', `showShop(${index})`)))
	}
}

function showExitPopup(): void {
	showPopup(Infinity, 'Confirm Retreat', div('popup-desc', 'Are you sure you want to retreat?') + div('popup-row', div('popup-button', 'Cancel', `hidePopup()`) + div('popup-button', 'Retreat', `hidePopup();changePhase(${Phase.World})`)))
}

function showPopup(time: number, title: string, body: string = ''): void {
	popupTitle = title
	popupBody = body
	setTickDelay(time)
	if (popupTimeout) clearTimeout(popupTimeout)
	if (time != Infinity) {
		popupTimeout = setTimeout(() => {
			popupTitle = ''
			popupBody = ''
			render()
		}, time)
	}
	playSound(soundBufferSelect)
	render()
}

function hidePopup(): void {
	showPopup(0, '')
}

function changePhase(p: Phase): void {
	if (p == Phase.World) {
		selected = null
		selectedAction = null
		selectedItem = null
		level = null
		server = null
		menuTrack.play()
	}
	if (phase == Phase.Setup && p != Phase.Setup) {
		for (let i = 0; i < map.length; i++) {
			if (map[i] == CellType.Spawn) map[i] = CellType.Empty
		}
	}
	phase = p
	if (p == Phase.Setup) showPopup(1000, "Setup Phase")
	if (p == Phase.Player) showPopup(1000, "Player's Turn")
	if (p == Phase.Enemy) showPopup(1000, "Enemy's Turn")
	if (p == Phase.Victory) {
		if (level) {
			let reward = level.reward
			if (server) {
				if (save.servers[WORLD.servers.indexOf(server)]) {
					reward /= 2
				} else {
					save.servers[WORLD.servers.indexOf(server)] = true
				}
			}
			save.money += reward
			showPopup(Infinity, "You won!", div('popup-desc', `Earned ${reward} credits`) + div('popup-button', 'Return to Overworld', `hidePopup();changePhase(${Phase.World})`))
		}
	}
	if (p == Phase.Loss) {
		showPopup(Infinity, "You lost...", div('popup-button', 'Return to Overworld', `hidePopup();changePhase(${Phase.World})`))
	}
	resetPrograms()
}

function setTickDelay(delay: number) {
	tickDelay = delay
	if (tickTimeout) clearTimeout(tickTimeout)
	tickTimeout = setTimeout(tick, delay)
}

function tick(): void {
	setTickDelay(200)
	if (phase == Phase.Player) {
		if (!map.some(v => v == CellType.Flag) && level && level.type == LevelType.Retrieve) {
			changePhase(Phase.Victory)
		} else if (!programs.some(p => !p.mine) && level && level.type == LevelType.Delete) {
			changePhase(Phase.Victory)
		} else if (programs.filter(p => p.mine).every(p => p.done)) {
			changePhase(Phase.Enemy)
		}
	} else if (phase == Phase.Enemy) {
		if (!programs.some(p => p.mine)) {
			changePhase(Phase.Loss)
		} else if (programs.filter(p => !p.mine).every(p => p.done)) {
			changePhase(Phase.Player)
		} else {
			let p = programs.filter(p => !p.mine).find(p => !p.done)
			if (p && p == selected) {
				let head = p.body[0]
				let t = programs.filter(v => v.mine).reduce((prev: Vec2[], v) => prev.concat(v.body), []).sort((a, b) => dist(a, head) - dist(b, head))[0]
				let d = dist(t, head)
				if (d <= p.type.actions[0].range) {
					setTickDelay(500)
					if (selectedAction) {
						act(programs.indexOf(p), 0, t.x, t.y)
					} else {
						selectAction(0)
					}
				} else if (p.moves > 0) {
					setTickDelay(200)
					let moves = getMoves(p, true)
					moves.sort((a, b) => {
						let diff = dist(a, t) - dist(b, t)
						if (diff != 0) return diff
						return a.d - b.d
					})
					let n = moves[0]
					let path: Vec2[] = []
					while (n && n.p) {
						path.unshift(n)
						n = n.p
					}
					t = path[0]
					if (t) {
						if (t.x < head.x && isEmpty({ x: head.x - 1, y: head.y })) {
							move(programs.indexOf(p), head.x - 1, head.y)
						}
						else if (t.y < head.y && isEmpty({ x: head.x, y: head.y - 1 })) {
							move(programs.indexOf(p), head.x, head.y - 1)
						}
						else if (t.x > head.x && isEmpty({ x: head.x + 1, y: head.y })) {
							move(programs.indexOf(p), head.x + 1, head.y)
						}
						else if (t.y > head.y && isEmpty({ x: head.x, y: head.y + 1 })) {
							move(programs.indexOf(p), head.x, head.y + 1)
						}
					} else {
						pass(programs.indexOf(p))
					}
				} else {
					pass(programs.indexOf(p))
				}
			} else if (p) {
				select(programs.indexOf(p))
				setTickDelay(500)
			}
		}
	}
}

function render(): void {
	let out = ''
	let bg = ''
	if (phase == Phase.World) {
		bg = 'bg2'
		if (server && server.type == ServerType.Shop) {
			out += div('ui', renderShopItemInfo() + renderShopItemActions() + renderShopInfo())
		}
		out += div('grids', renderLinks() + renderServers())
	} else {
		if (level) bg = level.bg
		out += div('ui', renderProgramInfo() + renderProgramActions() + renderBattleInfo())
		out += div('grids', renderCells() + renderPrograms() + renderOverlays())
	}
	out += renderPopup()
	diff.outerHTML(document.body, `<body class="${bg}">${out}</body>`)
}

function renderCells(): string {
	let out = ''
	for (let y = 0; y < GRID_HEIGHT; y++) {
		for (let x = 0; x < GRID_WIDTH; x++) {
			out += renderCell(x, y)
		}
	}
	return div('grid', out)
}

function renderPrograms(): string {
	let out = ''
	for (let program of programs) out += renderProgram(program)
	return div('grid', out)
}

function renderOverlays(): string {
	let out = ''
	if (selected && !selected.done && selected.moves > 0) {
		for (let v of getMoves(selected)) {
			out += renderOverlay(v.x, v.y, OverlayType.Move)
		}
	}
	if (selected && !selected.done && selectedAction) {
		let type = selectedAction.type == ActionType.Attack ? OverlayType.Attack : OverlayType.Effect
		for (let v of getTargets(selected, selectedAction)) {
			out += renderOverlay(v.x, v.y, type)
		}
	}
	return div('grid', out)
}

function renderCell(x: number, y: number): string {
	let type = map[y * GRID_WIDTH + x]
	if (!type) return div('cell cell-off')
	if (type == CellType.Spawn) return div('cell cell-on', icon('cell-icon fas fa-upload'), `showStorage(${x},${y})`)
	if (type == CellType.Flag) return div('cell cell-on', icon('cell-icon fas fa-file-archive'))
	return div('cell cell-on')
}

function renderProgram(program: Program): string {
	let out = ''
	for (let i = 0; i < program.body.length; i++) {
		let c = program.body[i]
		let inner = div('bevel-right') + div('bevel-bottom')
		if (i > 0) {
			inner += renderProgramSides(c, program.body[i - 1])
		}
		if (i < program.body.length - 1) {
			inner += renderProgramSides(c, program.body[i + 1])
		}
		if (i == 0) {
			inner += div('program-center', icon(`program-icon game-icon game-icon-${program.type.icon}`))

			if (program.done) inner += div('program-done', icon('program-done-icon fas fa-check-circle'))

			let onclick = (phase != Phase.Enemy && phase != Phase.EnemyAct && !popupTitle) ? `select(${programs.indexOf(program)})` : ''

			out += grid(c.x, c.y, `program program-head color-${program.type.color} ${program == selected ? 'selected' : ''}`, inner, onclick)
		} else {
			inner += div('program-center')
			out += grid(c.x, c.y, `program color-${program.type.color}`, inner)
		}
	}
	return out
}

function renderProgramSides(a: Vec2, b: Vec2): string {
	let out = ''
	if (b.x == a.x - 1 && b.y == a.y) out += div('program-left', div('bevel-bottom'))
	if (b.x == a.x + 1 && b.y == a.y) out += div('program-right', div('bevel-bottom'))
	if (b.x == a.x && b.y == a.y - 1) out += div('program-top', div('bevel-right'))
	if (b.x == a.x && b.y == a.y + 1) out += div('program-bottom', div('bevel-right'))
	return out
}

function renderOverlay(x: number, y: number, type: OverlayType): string {
	if (!selected) return ''
	let index = programs.indexOf(selected)
	if (type == OverlayType.Move) {
		let onclick = selected.mine && phase == Phase.Player && !popupTitle ? `move(${index},${x},${y})` : ''
		let h = selected.body[0]
		if (x == h.x && y == h.y + 1) {
			return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-down'), onclick)
		}
		if (x == h.x && y == h.y - 1) {
			return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-up'), onclick)
		}
		if (x == h.x - 1 && y == h.y) {
			return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-left'), onclick)
		}
		if (x == h.x + 1 && y == h.y) {
			return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-right'), onclick)
		}
		return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-square'))
	}
	if (type == OverlayType.Attack && selectedAction) {
		let aIndex = selected.type.actions.indexOf(selectedAction)
		let onclick = selected.mine && phase == Phase.Player ? `act(${index},${aIndex},${x},${y})` : ''
		return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-attack fal fa-expand'), onclick)
	}
	if (type == OverlayType.Effect && selectedAction) {
		let aIndex = selected.type.actions.indexOf(selectedAction)
		let onclick = selected.mine && phase == Phase.Player ? `act(${index},${aIndex},${x},${y})` : ''
		return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-effect fal fa-expand'), onclick)
	}
	return ''
}

function renderProgramInfo(): string {
	let out = ''
	if (selected) {
		out += div('ui-header', selected.type.name)
		out += div('ui-field', `Max Size: ${selected.type.size}`)
		out += div('ui-field', `Move Speed: ${selected.type.moves}`)
		out += div('ui-quote', selected.type.desc)

		out += div('ui-spacer')

		if (phase == Phase.Setup) {
			let index = programs.indexOf(selected)
			let head = selected.body[0]
			if (map[head.y * GRID_WIDTH + head.x] != CellType.Spawn || popupTitle) {
				out += div('ui-button ui-disabled', 'Remove')
			} else {
				out += div('ui-button', 'Remove', `remove(${index})`)
			}
		}

		if (phase == Phase.Player) {
			if (!selected || selected.done || !selected.mine || popupTitle) {
				out += div('ui-button ui-disabled', 'Undo Move')
				out += div('ui-button ui-disabled', 'Pass Turn')
			} else {
				let index = programs.indexOf(selected)
				out += div('ui-button', 'Undo Move', `cancel(${index})`)
				out += div('ui-button', 'Pass Turn', `pass(${index})`)
			}
		}
	}
	return div('ui-panel', out)
}

function renderProgramActions(): string {
	let out = ''
	if (selected) {
		for (let action of selected.type.actions) out += renderAction(action)
	}
	return div('ui-panel', out)
}

function renderAction(action: Action): string {
	let out = ''
	if (selected) {
		let index = selected.type.actions.indexOf(action)
		if (phase != Phase.Player || selected.done || !selected.mine || selected.body.length < action.minSize || popupTitle) {
			out += div('ui-button ui-disabled', action.name)
		} else {
			out += div('ui-button', action.name, `selectAction(${index})`)
		}
		let desc = [
			action.range > 1 ? `Range: ${action.range}` : '',
			action.minSize > 0 ? `Req. Size: ${action.minSize}` : '',
			action.cost > 0 ? `Cost: ${action.cost}` : ''
		].filter(s => s.length > 0).join(' ')
		if (desc) out += div('ui-field', desc)
		if (action.type == ActionType.Attack) {
			out += div('ui-quote', `Deletes ${action.power + ' sector' + (action.power != 1 ? 's' : '')} from target`)
		}
	}
	return out
}

function renderBattleInfo(): string {
	let out = ''
	if (server) {
		out += div('ui-header', server.name)
	}
	if (level) {
		if (level.type == LevelType.Delete) out += div('ui-quote', 'Delete all enemies to win')
		if (level.type == LevelType.Retrieve) out += div('ui-quote', 'Retrieve all files to win')
	}
	out += div('ui-spacer')
	if (phase == Phase.Setup) out += div('ui-quote', "Setup Phase")
	if (phase == Phase.Player || phase == Phase.PlayerAct) out += div('ui-quote', "Player's Turn")
	if (phase == Phase.Enemy || phase == Phase.EnemyAct) out += div('ui-quote', "Enemy's Turn")
	if (phase == Phase.Victory) out += div('ui-quote', "Victory")
	if (phase == Phase.Loss) out += div('ui-quote', "Loss")
	out += div('ui-spacer')
	if (phase == Phase.Setup) {
		out += div('ui-button', 'Start Battle', `changePhase(${Phase.Player})`)
	}
	if (phase != Phase.Enemy && phase != Phase.EnemyAct) {
		out += div('ui-button', 'Retreat', `showExitPopup()`)
	}
	return div('ui-panel', out)
}

function renderLinks(): string {
	let out = ''
	for (let link of WORLD.links) {
		let connected = link.pts.some(v => WORLD.servers.filter((s, i) => save.servers[i]).some(s => s.x == v.x && s.y == v.y))
		if (!connected) continue
		for (let i = 0; i < link.pts.length; i++) {
			let p = link.pts[i - 1]
			let c = link.pts[i]
			let n = link.pts[i + 1]
			let inner = ''
			if (i < link.pts.length - 1) {
				if (n.y > c.y) inner += div('link-down')
				if (n.y < c.y) inner += div('link-up')
				if (n.x > c.x) inner += div('link-right')
				if (n.x < c.x) inner += div('link-left')
			}
			if (i > 0) {
				if (c.y < p.y) inner += div('link-down')
				if (c.y > p.y) inner += div('link-up')
				if (c.x < p.x) inner += div('link-right')
				if (c.x > p.x) inner += div('link-left')
			}
			if (WORLD.servers.some(s => s.x == c.x && s.y == c.y)) {
				inner += div('link-center')
			}
			out += grid(c.x, c.y, 'link', inner)
		}
	}
	return div('grid', out)
}

function renderServers(): string {
	let out = ''
	for (let svr of WORLD.servers) {
		let index = WORLD.servers.indexOf(svr)
		let onclick = `showServer(${index})`
		let style = save.servers[index] ? 'fas' : 'fal'

		let connected = save.servers[index]
		if (!connected) {
			let links = WORLD.links.filter(l => l.pts.some(v => v.x == svr.x && v.y == svr.y))
			for (let link of links) {
				for (let pt of link.pts) {
					let s = WORLD.servers.findIndex(s => s.x == pt.x && s.y == pt.y)
					if (save.servers[s]) connected = true
					if (connected) break
				}
				if (connected) break
			}
		}
		if (!connected) continue
		if (svr.type == ServerType.Waypoint) {
			out += grid(svr.x, svr.y, 'server', div('server-label', svr.name) + icon(`server-icon ${style} fa-hdd`), onclick)
		}
		if (svr.type == ServerType.Battle) {
			out += grid(svr.x, svr.y, 'server', div('server-label', svr.name) + icon(`server-icon ${style} fa-database`), onclick)
		}
		if (svr.type == ServerType.Shop) {
			out += grid(svr.x, svr.y, 'server', div('server-label', svr.name) + icon(`server-icon ${style} fa-shopping-cart`), onclick)
		}
	}
	return div('grid', out)
}

function renderShopItemInfo(): string {
	let out = ''
	if (selectedItem) {
		out += div('ui-header', selectedItem.name)
		out += div('ui-field', `Max Size: ${selectedItem.size}`)
		out += div('ui-field', `Move Speed: ${selectedItem.moves}`)
		out += div('ui-quote', selectedItem.desc)

		out += div('ui-spacer')

		let index = (server as ShopServer).stock.indexOf(selectedItem)

		if (index >= 0) {
			if (save.money < selectedItem.cost) {
				out += div('ui-button ui-disabled', `Purchase (${selectedItem.cost})`)
			} else {
				out += div('ui-button', `Purchase (${selectedItem.cost})`, `purchase(${index})`)
			}
		}

		index = save.programs.indexOf(selectedItem)
		if (index >= 0) {
			out += div('ui-button', `Sell (${selectedItem.cost / 2})`, `sell(${index})`)
		}
	}
	return div('ui-panel', out)
}

function renderShopItemActions(): string {
	let out = ''
	if (selectedItem) {
		for (let action of selectedItem.actions) {
			out += div('ui-button ui-disabled', action.name)
			let desc = [
				action.range > 1 ? `Range: ${action.range}` : '',
				action.minSize > 0 ? `Req. Size: ${action.minSize}` : '',
				action.cost > 0 ? `Cost: ${action.cost}` : ''
			].filter(s => s.length > 0).join(' ')
			if (desc) out += div('ui-field', desc)
			if (action.type == ActionType.Attack) {
				out += div('ui-quote', `Deletes ${action.power + ' sector' + (action.power != 1 ? 's' : '')} from target`)
			}
		}
	}
	return div('ui-panel', out)
}

function renderShopInfo(): string {
	let out = ''
	if (server) {
		out += div('ui-header', server.name)
	}
	out += div('ui-field', `Cash: ${save.money}`)
	out += div('ui-spacer')
	out += div('ui-button', 'Exit Shop', `exitShop()`)
	return div('ui-panel', out)
}

function renderPopup(): string {
	let out = ''
	if (popupTitle || popupBody) {
		out += div('popup', div('popup-title', popupTitle) + div('popup-body', popupBody))
	}
	return out
}

function div(className: string, inner: string = '', click: string = ''): string {
	return `<div class="${className}" ${click ? `onclick="event.stopPropagation();${click}"` : ''}>${inner}</div>`
}

function grid(x: number, y: number, className: string, inner: string = '', click: string = ''): string {
	return `<div class="${className}" ${click ? `onclick="event.stopPropagation();${click}"` : ''} style="grid-row:${y + 1};grid-column:${x + 1};">${inner}</div>`
}

function icon(className: string): string {
	return `<i class="${className}"></i>`
}

const GRID_WIDTH = 15
const GRID_HEIGHT = 10
const MAX_PATH_LEN = 8

const PROGRAM_TYPES: ProgramType[] = [
	{
		name: 'Watchdog',
		desc: 'Its bark is worse than its byte',
		color: 'green',
		icon: 'hound',
		cost: 100,
		size: 4,
		moves: 4,
		actions: [
			{
				name: 'Byte',
				type: ActionType.Attack,
				power: 2,
				range: 1,
				cost: 0,
				minSize: 0
			}
		]
	},
	{
		name: 'Wolf',
		desc: 'Who let the dogs out?',
		color: 'lime',
		icon: 'wolf-head',
		cost: 300,
		size: 4,
		moves: 6,
		actions: [
			{
				name: 'Byte',
				type: ActionType.Attack,
				power: 2,
				range: 1,
				cost: 0,
				minSize: 0
			},
			{
				name: 'Mega Byte',
				type: ActionType.Attack,
				power: 3,
				range: 1,
				cost: 0,
				minSize: 3
			}
		]
	},
	{
		name: 'Guard',
		desc: 'Constant vigilance',
		color: 'orange',
		icon: 'visored-helm',
		cost: 50,
		size: 2,
		moves: 2,
		actions: [
			{
				name: 'Bash',
				type: ActionType.Attack,
				power: 1,
				range: 1,
				cost: 0,
				minSize: 0
			}
		]
	},
	{
		name: 'Trebuchet',
		desc: 'The superior siege engine',
		color: 'green',
		icon: 'trebuchet',
		cost: 250,
		size: 2,
		moves: 2,
		actions: [
			{
				name: 'Fling',
				type: ActionType.Attack,
				power: 2,
				range: 4,
				cost: 0,
				minSize: 0
			}
		]
	}
]

const WORLD: World = {
	servers: [
		{
			name: 'Headquarters',
			desc: 'Your access point to the network.',
			x: 7,
			y: 4,
			type: ServerType.Waypoint
		},
		{
			name: 'Chromcast Firewall',
			desc: 'Security Level: Low<br>A firewall keeping unauthorized traffic out of private networks. Delete the firewall software to continue onward.',
			x: 7,
			y: 2,
			type: ServerType.Battle,
			level: {
				type: LevelType.Delete,
				bg: 'bg0',
				reward: 100,
				programs: [
					{
						type: PROGRAM_TYPES.find(v => v.name == "Guard")!,
						body: [{ x: 10, y: 4 }]
					},
					{
						type: PROGRAM_TYPES.find(v => v.name == "Guard")!,
						body: [{ x: 10, y: 5 }]
					}
				],
				map: [
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0,
					0, 0, 0, 1, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
					0, 0, 0, 1, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
					0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
				]
			}
		},
		{
			name: 'Sentinel Enterprises',
			desc: 'Security Level: Low<br>A private security firm. Bypass the server\'s defenses to acquire a rare new antivirus program.',
			x: 4,
			y: 2,
			type: ServerType.Battle,
			level: {
				type: LevelType.Retrieve,
				bg: 'bg1',
				reward: 150,
				programs: [
					{
						type: PROGRAM_TYPES.find(v => v.name == "Guard")!,
						body: [{ x: 11, y: 4 }, { x: 12, y: 4 }]
					},
					{
						type: PROGRAM_TYPES.find(v => v.name == "Guard")!,
						body: [{ x: 11, y: 5 }, { x: 12, y: 5 }]
					}
				],
				map: [
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 3, 0,
					0, 1, 2, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0,
					0, 1, 2, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0,
					0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 3, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
				]
			}
		},
		{
			name: 'Warez Warehouse',
			desc: 'A shady program distribution site. Purchase new programs here.',
			x: 5,
			y: 1,
			type: ServerType.Shop,
			stock: [
				PROGRAM_TYPES.find(v => v.name == "Wolf")!,
				PROGRAM_TYPES.find(v => v.name == "Trebuchet")!
			]
		}
	],
	links: [
		{ pts: [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }] },
		{ pts: [{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }] },
		{ pts: [{ x: 7, y: 2 }, { x: 7, y: 3 }, { x: 7, y: 4 }] }
	]
}

let actx = new AudioContext()

let menuTrack = new Track('mp3/DST-Horizon515.mp3')
menuTrack.play()

let battleTracks = [
	new Track('mp3/DST-impuretechnology.mp3'),
	new Track('mp3/DST-KiloByte.mp3'),
	new Track('mp3/DST-Rendevouz.mp3'),
	new Track('mp3/DST-Robotix.mp3'),
	new Track('mp3/DST-TowerDefenseTheme.mp3'),
	new Track('mp3/DST-TowerDefenseTheme3.mp3'),
]

let soundBufferSelect: AudioBuffer | null = null
loadSound('wav/select.wav', buf => soundBufferSelect = buf)
let soundBufferHit: AudioBuffer | null = null
loadSound('wav/hit.wav', buf => soundBufferHit = buf)
let soundBufferMove: AudioBuffer | null = null
loadSound('wav/move.wav', buf => soundBufferMove = buf)
let soundBufferTarget: AudioBuffer | null = null
loadSound('wav/target.wav', buf => soundBufferTarget = buf)
let soundBufferPickup: AudioBuffer | null = null
loadSound('wav/pickup.wav', buf => soundBufferPickup = buf)
let soundBufferPurchase: AudioBuffer | null = null
loadSound('wav/purchase.wav', buf => soundBufferPurchase = buf)

let save: Save = {
	programs: [
		PROGRAM_TYPES[0],
		PROGRAM_TYPES[0],
		PROGRAM_TYPES[1]
	],
	servers: [
		true
	],
	money: 500
}

let selected: Program | null = null
let selectedAction: Action | null = null
let selectedItem: ProgramType | null = null
let phase: Phase = Phase.World
let tickDelay: number = 200
let tickTimeout: number = 0
let programs: Program[] = []
let map: CellType[] = []
let level: Level | null = null
let server: WaypointServer | BattleServer | ShopServer | null = null
let storage: ProgramType[] = []
let popupTitle: string = ''
let popupBody: string = ''
let popupTimeout: number = 0

addEventListener('keydown', ev => {
	if (selected && selected.mine && phase == Phase.Player && !popupTitle) {
		let index = programs.indexOf(selected)
		let head = selected.body[0]
		if (ev.key == 'ArrowLeft') move(index, head.x - 1, head.y)
		if (ev.key == 'ArrowRight') move(index, head.x + 1, head.y)
		if (ev.key == 'ArrowUp') move(index, head.x, head.y - 1)
		if (ev.key == 'ArrowDown') move(index, head.x, head.y + 1)
		if (ev.key == 'Escape') cancel(index)
	}
	if (ev.key == 'Enter') changePhase(Phase.Victory)
})

document.body.addEventListener('click', ev => {
	if (selected && phase != Phase.Enemy && phase != Phase.EnemyAct && !popupTitle) {
		if (selected.moves == selected.initialMoves) {
			cancel(programs.indexOf(selected))
		} else {
			pass(programs.indexOf(selected))
		}
	}
})

document.addEventListener('visibilitychange', ev => {
	if (Track.current) {
		if (document.hidden) Track.current.pause()
		else Track.current.resume()
	}
})

tick()
render()