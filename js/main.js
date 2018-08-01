"use strict";
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
var Track = /** @class */ (function () {
    function Track(url) {
        var _this = this;
        this.url = url;
        this.buffer = null;
        this.src = null;
        this.disconnectTimeout = null;
        this.gain = actx.createGain();
        this.gain.connect(actx.destination);
        loadSound(url, function (buff) {
            _this.buffer = buff;
            if (_this == Track.playWhenReady)
                _this.play();
        });
        Track.tracks.push(this);
    }
    Track.prototype.isReady = function () {
        return this.buffer != null;
    };
    Track.prototype.play = function () {
        if (this.isReady()) {
            Track.current = this;
            for (var _i = 0, _a = Track.tracks; _i < _a.length; _i++) {
                var track = _a[_i];
                if (track != this)
                    track.stop();
            }
            if (this.disconnectTimeout)
                clearTimeout(this.disconnectTimeout);
            if (!this.src) {
                this.src = playSound(this.buffer, this.gain);
                if (this.src)
                    this.src.loop = true;
            }
            this.gain.gain.linearRampToValueAtTime(.5, actx.currentTime + 0.5);
        }
        else {
            Track.playWhenReady = this;
        }
    };
    Track.prototype.pause = function () {
        this.gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.5);
    };
    Track.prototype.resume = function () {
        this.gain.gain.linearRampToValueAtTime(.5, actx.currentTime + 0.5);
    };
    Track.prototype.stop = function () {
        var _this = this;
        if (this == Track.playWhenReady)
            Track.playWhenReady = null;
        this.gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.5);
        this.disconnectTimeout = setTimeout(function () {
            if (_this.src) {
                _this.src.stop();
                _this.src.disconnect();
                _this.src = null;
            }
        }, 500);
    };
    Track.tracks = [];
    Track.current = null;
    Track.playWhenReady = null;
    return Track;
}());
function loadSound(url, cb) {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.responseType = 'arraybuffer';
    req.onload = function () {
        actx.decodeAudioData(req.response, cb, function (err) { return console.log(err); });
    };
    req.send();
}
function playSound(buffer, dest) {
    if (!buffer)
        return null;
    var src = actx.createBufferSource();
    src.buffer = buffer;
    if (dest) {
        src.connect(dest);
    }
    else {
        src.connect(actx.destination);
    }
    src.start(0);
    return src;
}
function dist(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function isEmpty(v) {
    return map[v.y * GRID_WIDTH + v.x] != 0 /* None */ && !programs.some(function (p) { return p.body.some(function (b) { return b.x == v.x && b.y == v.y; }); });
}
function neighbors(v) {
    return [
        { x: v.x - 1, y: v.y },
        { x: v.x + 1, y: v.y },
        { x: v.x, y: v.y - 1 },
        { x: v.x, y: v.y + 1 }
    ];
}
function filteredNeighbors(v, filter, exclude) {
    var result = [];
    var ns = neighbors(v).filter(function (n) { return filter(n); });
    var _loop_1 = function (n) {
        var existing = exclude.find(function (e) { return e.x == n.x && e.y == n.y; });
        if (existing && existing.d >= v.d + 1) {
            existing.d = v.d + 1;
            existing.p = v;
            result.push(existing);
        }
        else {
            result.push(__assign({}, n, { d: v.d + 1, p: v }));
        }
    };
    for (var _i = 0, ns_1 = ns; _i < ns_1.length; _i++) {
        var n = ns_1[_i];
        _loop_1(n);
    }
    return result;
}
function getMoves(p, ignoreDistance) {
    if (ignoreDistance === void 0) { ignoreDistance = false; }
    var head = __assign({}, p.body[0], { d: 0, p: null });
    var frontier = [];
    var closed = [];
    frontier.push.apply(frontier, filteredNeighbors(head, function (n) { return isEmpty(n); }, closed));
    var _loop_2 = function () {
        var v = frontier.pop();
        if (!closed.some(function (c) { return c.x == v.x && c.y == v.y; })) {
            closed.push(v);
        }
        if ((ignoreDistance && v.d < MAX_PATH_LEN) || v.d < p.moves) {
            frontier.push.apply(frontier, filteredNeighbors(v, function (n) { return isEmpty(n); }, closed));
        }
    };
    while (frontier.length > 0) {
        _loop_2();
    }
    return closed;
}
function getTargets(p, a) {
    var head = __assign({}, p.body[0], { d: 0, p: null });
    var frontier = [];
    var closed = [];
    frontier.push.apply(frontier, filteredNeighbors(head, function (n) { return true; }, closed));
    var _loop_3 = function () {
        var v = frontier.pop();
        if (!closed.some(function (c) { return c.x == v.x && c.y == v.y; }))
            closed.push(v);
        if (v.d < a.range)
            frontier.push.apply(frontier, filteredNeighbors(v, function (n) { return true; }, closed));
    };
    while (frontier.length > 0) {
        _loop_3();
    }
    return closed.filter(function (n) { return programs.some(function (r) { return r.body.some(function (b) { return b.x == n.x && b.y == n.y; }); }); });
}
function loadProgram(p) {
    return __assign({ mine: false }, p, { body: p.body.map(function (v) { return (__assign({}, v)); }), moves: p.type.moves, done: false, initialMoves: p.type.moves, initialBody: p.body.map(function (v) { return (__assign({}, v)); }) });
}
function loadLevel(index) {
    var svr = WORLD.servers[index];
    server = svr;
    var lvl = svr.level;
    storage = save.programs.slice();
    programs = lvl.programs.map(function (v) { return loadProgram(v); });
    map = lvl.map.slice();
    level = lvl;
    changePhase(1 /* Setup */);
    battleTracks[Math.floor(Math.random() * battleTracks.length)].play();
    render();
}
function remove(index) {
    storage.push(programs[index].type);
    programs.splice(index, 1);
    selected = null;
    selectedAction = null;
    render();
}
function place(x, y, index) {
    var t = storage[index];
    storage.splice(index, 1);
    var p = loadProgram({ type: t, body: [{ x: x, y: y }], mine: true });
    programs.push(p);
    hidePopup();
    select(programs.length - 1);
}
function select(index) {
    if (programs[index] == selected)
        return;
    if (selected && !selected.done && selected.moves != selected.initialMoves) {
        pass(programs.indexOf(selected));
    }
    selected = programs[index];
    selectedAction = null;
    render();
}
function move(index, x, y) {
    var p = programs[index];
    if (!p.done && p.moves > 0 && isEmpty({ x: x, y: y })) {
        playSound(soundBufferMove);
        p.body.unshift({ x: x, y: y });
        if (p.body.length > p.type.size)
            p.body.pop();
        p.moves--;
        if (p.mine && map[y * GRID_WIDTH + x] == 3 /* Flag */) {
            map[y * GRID_WIDTH + x] = 1 /* Empty */;
            playSound(soundBufferPickup);
            showPopup(1000, 'File retrieved!');
        }
        render();
    }
}
function cancel(index) {
    var p = programs[index];
    if (!p.done && p.moves != p.initialMoves) {
        p.moves = p.initialMoves;
        p.body = p.initialBody.map(function (v) { return (__assign({}, v)); });
        selectedAction = null;
        render();
    }
    else if (selected) {
        selected = null;
        selectedAction = null;
        render();
    }
}
function pass(index) {
    var p = programs[index];
    if (!p.done) {
        p.done = true;
        selected = null;
        selectedAction = null;
        render();
    }
}
function selectAction(index) {
    if (selected) {
        var a = selected.type.actions[index];
        if (a != selectedAction && selected.body.length >= a.minSize) {
            playSound(soundBufferTarget);
            selectedAction = a;
            render();
        }
    }
}
function act(pIndex, aIndex, x, y) {
    var p = programs[pIndex];
    var a = p.type.actions[aIndex];
    pass(pIndex);
    if (phase == 2 /* Player */)
        phase = 3 /* PlayerAct */;
    if (phase == 4 /* Enemy */)
        phase = 5 /* EnemyAct */;
    if (a.type == 1 /* Attack */) {
        var t_1 = programs.find(function (v) { return v.body.some(function (b) { return b.x == x && b.y == y; }); });
        if (t_1) {
            var dmg = Math.min(t_1.body.length, a.power);
            for (var d = 1; d <= dmg; d++) {
                setTimeout(function () {
                    playSound(soundBufferHit);
                    if (t_1)
                        t_1.body.pop();
                    programs = programs.filter(function (v) { return v.body.length > 0; });
                    render();
                }, 200 * d);
                setTimeout(function () {
                    if (phase == 3 /* PlayerAct */)
                        phase = 2 /* Player */;
                    if (phase == 5 /* EnemyAct */)
                        phase = 4 /* Enemy */;
                    render();
                }, 200 * dmg);
            }
        }
    }
    render();
}
function resetPrograms() {
    for (var _i = 0, programs_1 = programs; _i < programs_1.length; _i++) {
        var p = programs_1[_i];
        p.done = false;
        p.initialMoves = p.type.moves;
        p.initialBody = p.body.map(function (v) { return (__assign({}, v)); });
        p.moves = p.initialMoves;
    }
    render();
}
function showStorage(x, y) {
    var out = '';
    var counts = {};
    var types = {};
    for (var _i = 0, storage_1 = storage; _i < storage_1.length; _i++) {
        var p = storage_1[_i];
        if (!counts[p.name])
            counts[p.name] = 0;
        counts[p.name]++;
        if (!types[p.name])
            types[p.name] = p;
    }
    for (var key in counts) {
        var index = storage.indexOf(types[key]);
        out += div('popup-button', key + " x" + counts[key], "place(" + x + "," + y + "," + index + ")");
    }
    showPopup(Infinity, 'Select Program', out);
}
function showShop(index) {
    var svr = WORLD.servers[index];
    server = svr;
    save.servers[index] = true;
    var out = '';
    out += div('popup-desc', 'Shop');
    for (var _i = 0, _a = svr.stock; _i < _a.length; _i++) {
        var item = _a[_i];
        var itemIndex = svr.stock.indexOf(item);
        out += div('popup-button', item.name + " (" + item.cost + ")", "selectShopItem(" + itemIndex + ")");
    }
    out += div('popup-desc', 'Inventory');
    var counts = {};
    var types = {};
    for (var _b = 0, _c = save.programs; _b < _c.length; _b++) {
        var p = _c[_b];
        if (!counts[p.name])
            counts[p.name] = 0;
        counts[p.name]++;
        if (!types[p.name])
            types[p.name] = p;
    }
    for (var key in counts) {
        var itemIndex = save.programs.indexOf(types[key]);
        out += div('popup-button', key + " x" + counts[key], "selectStorageItem(" + itemIndex + ")");
    }
    showPopup(Infinity, svr.name, out);
}
function exitShop() {
    selectedItem = null;
    server = null;
    hidePopup();
}
function selectShopItem(index) {
    selectedItem = server.stock[index];
    render();
}
function selectStorageItem(index) {
    selectedItem = save.programs[index];
    render();
}
function purchase(index) {
    var item = server.stock[index];
    if (save.money >= item.cost) {
        save.money -= item.cost;
        save.programs.push(item);
        playSound(soundBufferPurchase);
        if (server)
            showShop(WORLD.servers.indexOf(server));
    }
}
function sell(index) {
    var item = save.programs[index];
    save.money += item.cost / 2;
    save.programs.splice(index, 1);
    playSound(soundBufferPurchase);
    if (server)
        showShop(WORLD.servers.indexOf(server));
}
function showServer(index) {
    var svr = WORLD.servers[index];
    if (svr.type == 0 /* Waypoint */) {
        showPopup(Infinity, svr.name, div('popup-desc', svr.desc) + div('popup-button', 'Exit', "hidePopup()"));
    }
    if (svr.type == 1 /* Battle */) {
        showPopup(Infinity, svr.name, div('popup-desc', svr.desc) + div('popup-row', div('popup-button', 'Cancel', "hidePopup()") + div('popup-button', 'Battle', "loadLevel(" + index + ")")));
    }
    if (svr.type == 2 /* Shop */) {
        showPopup(Infinity, svr.name, div('popup-desc', svr.desc) + div('popup-row', div('popup-button', 'Cancel', "hidePopup()") + div('popup-button', 'Shop', "showShop(" + index + ")")));
    }
}
function showExitPopup() {
    showPopup(Infinity, 'Confirm Retreat', div('popup-desc', 'Are you sure you want to retreat?') + div('popup-row', div('popup-button', 'Cancel', "hidePopup()") + div('popup-button', 'Retreat', "hidePopup();changePhase(" + 0 /* World */ + ")")));
}
function showPopup(time, title, body) {
    if (body === void 0) { body = ''; }
    popupTitle = title;
    popupBody = body;
    setTickDelay(time);
    if (popupTimeout)
        clearTimeout(popupTimeout);
    if (time != Infinity) {
        popupTimeout = setTimeout(function () {
            popupTitle = '';
            popupBody = '';
            render();
        }, time);
    }
    playSound(soundBufferSelect);
    render();
}
function hidePopup() {
    showPopup(0, '');
}
function changePhase(p) {
    if (p == 0 /* World */) {
        selected = null;
        selectedAction = null;
        selectedItem = null;
        level = null;
        server = null;
        menuTrack.play();
    }
    if (phase == 1 /* Setup */ && p != 1 /* Setup */) {
        for (var i = 0; i < map.length; i++) {
            if (map[i] == 2 /* Spawn */)
                map[i] = 1 /* Empty */;
        }
    }
    phase = p;
    if (p == 1 /* Setup */)
        showPopup(1000, "Setup Phase");
    if (p == 2 /* Player */)
        showPopup(1000, "Player's Turn");
    if (p == 4 /* Enemy */)
        showPopup(1000, "Enemy's Turn");
    if (p == 6 /* Victory */) {
        if (level) {
            var reward = level.reward;
            if (server) {
                if (save.servers[WORLD.servers.indexOf(server)]) {
                    reward /= 2;
                }
                else {
                    save.servers[WORLD.servers.indexOf(server)] = true;
                }
            }
            save.money += reward;
            showPopup(Infinity, "You won!", div('popup-desc', "Earned " + reward + " credits") + div('popup-button', 'Return to Overworld', "hidePopup();changePhase(" + 0 /* World */ + ")"));
        }
    }
    if (p == 7 /* Loss */) {
        showPopup(Infinity, "You lost...", div('popup-button', 'Return to Overworld', "hidePopup();changePhase(" + 0 /* World */ + ")"));
    }
    resetPrograms();
}
function setTickDelay(delay) {
    tickDelay = delay;
    if (tickTimeout)
        clearTimeout(tickTimeout);
    tickTimeout = setTimeout(tick, delay);
}
function tick() {
    setTickDelay(200);
    if (phase == 2 /* Player */) {
        if (!map.some(function (v) { return v == 3 /* Flag */; }) && level && level.type == 1 /* Retrieve */) {
            changePhase(6 /* Victory */);
        }
        else if (!programs.some(function (p) { return !p.mine; }) && level && level.type == 0 /* Delete */) {
            changePhase(6 /* Victory */);
        }
        else if (programs.filter(function (p) { return p.mine; }).every(function (p) { return p.done; })) {
            changePhase(4 /* Enemy */);
        }
    }
    else if (phase == 4 /* Enemy */) {
        if (!programs.some(function (p) { return p.mine; })) {
            changePhase(7 /* Loss */);
        }
        else if (programs.filter(function (p) { return !p.mine; }).every(function (p) { return p.done; })) {
            changePhase(2 /* Player */);
        }
        else {
            var p = programs.filter(function (p) { return !p.mine; }).find(function (p) { return !p.done; });
            if (p && p == selected) {
                var head_1 = p.body[0];
                var t_2 = programs.filter(function (v) { return v.mine; }).reduce(function (prev, v) { return prev.concat(v.body); }, []).sort(function (a, b) { return dist(a, head_1) - dist(b, head_1); })[0];
                var d = dist(t_2, head_1);
                if (d <= p.type.actions[0].range) {
                    setTickDelay(500);
                    if (selectedAction) {
                        act(programs.indexOf(p), 0, t_2.x, t_2.y);
                    }
                    else {
                        selectAction(0);
                    }
                }
                else if (p.moves > 0) {
                    setTickDelay(200);
                    var moves = getMoves(p, true);
                    moves.sort(function (a, b) {
                        var diff = dist(a, t_2) - dist(b, t_2);
                        if (diff != 0)
                            return diff;
                        return a.d - b.d;
                    });
                    var n = moves[0];
                    var path = [];
                    while (n && n.p) {
                        path.unshift(n);
                        n = n.p;
                    }
                    t_2 = path[0];
                    if (t_2) {
                        if (t_2.x < head_1.x && isEmpty({ x: head_1.x - 1, y: head_1.y })) {
                            move(programs.indexOf(p), head_1.x - 1, head_1.y);
                        }
                        else if (t_2.y < head_1.y && isEmpty({ x: head_1.x, y: head_1.y - 1 })) {
                            move(programs.indexOf(p), head_1.x, head_1.y - 1);
                        }
                        else if (t_2.x > head_1.x && isEmpty({ x: head_1.x + 1, y: head_1.y })) {
                            move(programs.indexOf(p), head_1.x + 1, head_1.y);
                        }
                        else if (t_2.y > head_1.y && isEmpty({ x: head_1.x, y: head_1.y + 1 })) {
                            move(programs.indexOf(p), head_1.x, head_1.y + 1);
                        }
                    }
                    else {
                        pass(programs.indexOf(p));
                    }
                }
                else {
                    pass(programs.indexOf(p));
                }
            }
            else if (p) {
                select(programs.indexOf(p));
                setTickDelay(500);
            }
        }
    }
}
function render() {
    var out = '';
    var bg = '';
    if (phase == 0 /* World */) {
        bg = 'bg2';
        if (server && server.type == 2 /* Shop */) {
            out += div('ui', renderShopItemInfo() + renderShopItemActions() + renderShopInfo());
        }
        out += div('grids', renderLinks() + renderServers());
    }
    else {
        if (level)
            bg = level.bg;
        out += div('ui', renderProgramInfo() + renderProgramActions() + renderBattleInfo());
        out += div('grids', renderCells() + renderPrograms() + renderOverlays());
    }
    out += renderPopup();
    diff.outerHTML(document.body, "<body class=\"" + bg + "\">" + out + "</body>");
}
function renderCells() {
    var out = '';
    for (var y = 0; y < GRID_HEIGHT; y++) {
        for (var x = 0; x < GRID_WIDTH; x++) {
            out += renderCell(x, y);
        }
    }
    return div('grid', out);
}
function renderPrograms() {
    var out = '';
    for (var _i = 0, programs_2 = programs; _i < programs_2.length; _i++) {
        var program = programs_2[_i];
        out += renderProgram(program);
    }
    return div('grid', out);
}
function renderOverlays() {
    var out = '';
    if (selected && !selected.done && selected.moves > 0) {
        for (var _i = 0, _a = getMoves(selected); _i < _a.length; _i++) {
            var v = _a[_i];
            out += renderOverlay(v.x, v.y, 0 /* Move */);
        }
    }
    if (selected && !selected.done && selectedAction) {
        var type = selectedAction.type == 1 /* Attack */ ? 1 /* Attack */ : 2 /* Effect */;
        for (var _b = 0, _c = getTargets(selected, selectedAction); _b < _c.length; _b++) {
            var v = _c[_b];
            out += renderOverlay(v.x, v.y, type);
        }
    }
    return div('grid', out);
}
function renderCell(x, y) {
    var type = map[y * GRID_WIDTH + x];
    if (!type)
        return div('cell cell-off');
    if (type == 2 /* Spawn */)
        return div('cell cell-on', icon('cell-icon fas fa-upload'), "showStorage(" + x + "," + y + ")");
    if (type == 3 /* Flag */)
        return div('cell cell-on', icon('cell-icon fas fa-file-archive'));
    return div('cell cell-on');
}
function renderProgram(program) {
    var out = '';
    for (var i = 0; i < program.body.length; i++) {
        var c = program.body[i];
        var inner = div('bevel-right') + div('bevel-bottom');
        if (i > 0) {
            inner += renderProgramSides(c, program.body[i - 1]);
        }
        if (i < program.body.length - 1) {
            inner += renderProgramSides(c, program.body[i + 1]);
        }
        if (i == 0) {
            inner += div('program-center', icon("program-icon game-icon game-icon-" + program.type.icon));
            if (program.done)
                inner += div('program-done', icon('program-done-icon fas fa-check-circle'));
            var onclick_1 = (phase != 4 /* Enemy */ && phase != 5 /* EnemyAct */ && !popupTitle) ? "select(" + programs.indexOf(program) + ")" : '';
            out += grid(c.x, c.y, "program program-head color-" + program.type.color + " " + (program == selected ? 'selected' : ''), inner, onclick_1);
        }
        else {
            inner += div('program-center');
            out += grid(c.x, c.y, "program color-" + program.type.color, inner);
        }
    }
    return out;
}
function renderProgramSides(a, b) {
    var out = '';
    if (b.x == a.x - 1 && b.y == a.y)
        out += div('program-left', div('bevel-bottom'));
    if (b.x == a.x + 1 && b.y == a.y)
        out += div('program-right', div('bevel-bottom'));
    if (b.x == a.x && b.y == a.y - 1)
        out += div('program-top', div('bevel-right'));
    if (b.x == a.x && b.y == a.y + 1)
        out += div('program-bottom', div('bevel-right'));
    return out;
}
function renderOverlay(x, y, type) {
    if (!selected)
        return '';
    var index = programs.indexOf(selected);
    if (type == 0 /* Move */) {
        var onclick_2 = selected.mine && phase == 2 /* Player */ && !popupTitle ? "move(" + index + "," + x + "," + y + ")" : '';
        var h = selected.body[0];
        if (x == h.x && y == h.y + 1) {
            return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-down'), onclick_2);
        }
        if (x == h.x && y == h.y - 1) {
            return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-up'), onclick_2);
        }
        if (x == h.x - 1 && y == h.y) {
            return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-left'), onclick_2);
        }
        if (x == h.x + 1 && y == h.y) {
            return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-arrow-square-right'), onclick_2);
        }
        return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-move fal fa-square'));
    }
    if (type == 1 /* Attack */ && selectedAction) {
        var aIndex = selected.type.actions.indexOf(selectedAction);
        var onclick_3 = selected.mine && phase == 2 /* Player */ ? "act(" + index + "," + aIndex + "," + x + "," + y + ")" : '';
        return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-attack fal fa-expand'), onclick_3);
    }
    if (type == 2 /* Effect */ && selectedAction) {
        var aIndex = selected.type.actions.indexOf(selectedAction);
        var onclick_4 = selected.mine && phase == 2 /* Player */ ? "act(" + index + "," + aIndex + "," + x + "," + y + ")" : '';
        return grid(x, y, 'overlay', icon('overlay-icon overlay-icon-effect fal fa-expand'), onclick_4);
    }
    return '';
}
function renderProgramInfo() {
    var out = '';
    if (selected) {
        out += div('ui-header', selected.type.name);
        out += div('ui-field', "Max Size: " + selected.type.size);
        out += div('ui-field', "Move Speed: " + selected.type.moves);
        out += div('ui-quote', selected.type.desc);
        out += div('ui-spacer');
        if (phase == 1 /* Setup */) {
            var index = programs.indexOf(selected);
            var head = selected.body[0];
            if (map[head.y * GRID_WIDTH + head.x] != 2 /* Spawn */ || popupTitle) {
                out += div('ui-button ui-disabled', 'Remove');
            }
            else {
                out += div('ui-button', 'Remove', "remove(" + index + ")");
            }
        }
        if (phase == 2 /* Player */) {
            if (!selected || selected.done || !selected.mine || popupTitle) {
                out += div('ui-button ui-disabled', 'Undo Move');
                out += div('ui-button ui-disabled', 'Pass Turn');
            }
            else {
                var index = programs.indexOf(selected);
                out += div('ui-button', 'Undo Move', "cancel(" + index + ")");
                out += div('ui-button', 'Pass Turn', "pass(" + index + ")");
            }
        }
    }
    return div('ui-panel', out);
}
function renderProgramActions() {
    var out = '';
    if (selected) {
        for (var _i = 0, _a = selected.type.actions; _i < _a.length; _i++) {
            var action = _a[_i];
            out += renderAction(action);
        }
    }
    return div('ui-panel', out);
}
function renderAction(action) {
    var out = '';
    if (selected) {
        var index = selected.type.actions.indexOf(action);
        if (phase != 2 /* Player */ || selected.done || !selected.mine || selected.body.length < action.minSize || popupTitle) {
            out += div('ui-button ui-disabled', action.name);
        }
        else {
            out += div('ui-button', action.name, "selectAction(" + index + ")");
        }
        var desc = [
            action.range > 1 ? "Range: " + action.range : '',
            action.minSize > 0 ? "Req. Size: " + action.minSize : '',
            action.cost > 0 ? "Cost: " + action.cost : ''
        ].filter(function (s) { return s.length > 0; }).join(' ');
        if (desc)
            out += div('ui-field', desc);
        if (action.type == 1 /* Attack */) {
            out += div('ui-quote', "Deletes " + (action.power + ' sector' + (action.power != 1 ? 's' : '')) + " from target");
        }
    }
    return out;
}
function renderBattleInfo() {
    var out = '';
    if (server) {
        out += div('ui-header', server.name);
    }
    if (level) {
        if (level.type == 0 /* Delete */)
            out += div('ui-quote', 'Delete all enemies to win');
        if (level.type == 1 /* Retrieve */)
            out += div('ui-quote', 'Retrieve all files to win');
    }
    out += div('ui-spacer');
    if (phase == 1 /* Setup */)
        out += div('ui-quote', "Setup Phase");
    if (phase == 2 /* Player */ || phase == 3 /* PlayerAct */)
        out += div('ui-quote', "Player's Turn");
    if (phase == 4 /* Enemy */ || phase == 5 /* EnemyAct */)
        out += div('ui-quote', "Enemy's Turn");
    if (phase == 6 /* Victory */)
        out += div('ui-quote', "Victory");
    if (phase == 7 /* Loss */)
        out += div('ui-quote', "Loss");
    out += div('ui-spacer');
    if (phase == 1 /* Setup */) {
        out += div('ui-button', 'Start Battle', "changePhase(" + 2 /* Player */ + ")");
    }
    if (phase != 4 /* Enemy */ && phase != 5 /* EnemyAct */) {
        out += div('ui-button', 'Retreat', "showExitPopup()");
    }
    return div('ui-panel', out);
}
function renderLinks() {
    var out = '';
    for (var _i = 0, _a = WORLD.links; _i < _a.length; _i++) {
        var link = _a[_i];
        var connected = link.pts.some(function (v) { return WORLD.servers.filter(function (s, i) { return save.servers[i]; }).some(function (s) { return s.x == v.x && s.y == v.y; }); });
        if (!connected)
            continue;
        var _loop_4 = function (i) {
            var p = link.pts[i - 1];
            var c = link.pts[i];
            var n = link.pts[i + 1];
            var inner = '';
            if (i < link.pts.length - 1) {
                if (n.y > c.y)
                    inner += div('link-down');
                if (n.y < c.y)
                    inner += div('link-up');
                if (n.x > c.x)
                    inner += div('link-right');
                if (n.x < c.x)
                    inner += div('link-left');
            }
            if (i > 0) {
                if (c.y < p.y)
                    inner += div('link-down');
                if (c.y > p.y)
                    inner += div('link-up');
                if (c.x < p.x)
                    inner += div('link-right');
                if (c.x > p.x)
                    inner += div('link-left');
            }
            if (WORLD.servers.some(function (s) { return s.x == c.x && s.y == c.y; })) {
                inner += div('link-center');
            }
            out += grid(c.x, c.y, 'link', inner);
        };
        for (var i = 0; i < link.pts.length; i++) {
            _loop_4(i);
        }
    }
    return div('grid', out);
}
function renderServers() {
    var out = '';
    var _loop_5 = function (svr) {
        var index = WORLD.servers.indexOf(svr);
        var onclick_5 = "showServer(" + index + ")";
        var style = save.servers[index] ? 'fas' : 'fal';
        var connected = save.servers[index];
        if (!connected) {
            var links = WORLD.links.filter(function (l) { return l.pts.some(function (v) { return v.x == svr.x && v.y == svr.y; }); });
            for (var _i = 0, links_1 = links; _i < links_1.length; _i++) {
                var link = links_1[_i];
                var _loop_6 = function (pt) {
                    var s = WORLD.servers.findIndex(function (s) { return s.x == pt.x && s.y == pt.y; });
                    if (save.servers[s])
                        connected = true;
                    if (connected)
                        return "break";
                };
                for (var _a = 0, _b = link.pts; _a < _b.length; _a++) {
                    var pt = _b[_a];
                    var state_1 = _loop_6(pt);
                    if (state_1 === "break")
                        break;
                }
                if (connected)
                    break;
            }
        }
        if (!connected)
            return "continue";
        if (svr.type == 0 /* Waypoint */) {
            out += grid(svr.x, svr.y, 'server', div('server-label', svr.name) + icon("server-icon " + style + " fa-hdd"), onclick_5);
        }
        if (svr.type == 1 /* Battle */) {
            out += grid(svr.x, svr.y, 'server', div('server-label', svr.name) + icon("server-icon " + style + " fa-database"), onclick_5);
        }
        if (svr.type == 2 /* Shop */) {
            out += grid(svr.x, svr.y, 'server', div('server-label', svr.name) + icon("server-icon " + style + " fa-shopping-cart"), onclick_5);
        }
    };
    for (var _i = 0, _a = WORLD.servers; _i < _a.length; _i++) {
        var svr = _a[_i];
        _loop_5(svr);
    }
    return div('grid', out);
}
function renderShopItemInfo() {
    var out = '';
    if (selectedItem) {
        out += div('ui-header', selectedItem.name);
        out += div('ui-field', "Max Size: " + selectedItem.size);
        out += div('ui-field', "Move Speed: " + selectedItem.moves);
        out += div('ui-quote', selectedItem.desc);
        out += div('ui-spacer');
        var index = server.stock.indexOf(selectedItem);
        if (index >= 0) {
            if (save.money < selectedItem.cost) {
                out += div('ui-button ui-disabled', "Purchase (" + selectedItem.cost + ")");
            }
            else {
                out += div('ui-button', "Purchase (" + selectedItem.cost + ")", "purchase(" + index + ")");
            }
        }
        index = save.programs.indexOf(selectedItem);
        if (index >= 0) {
            out += div('ui-button', "Sell (" + selectedItem.cost / 2 + ")", "sell(" + index + ")");
        }
    }
    return div('ui-panel', out);
}
function renderShopItemActions() {
    var out = '';
    if (selectedItem) {
        for (var _i = 0, _a = selectedItem.actions; _i < _a.length; _i++) {
            var action = _a[_i];
            out += div('ui-button ui-disabled', action.name);
            var desc = [
                action.range > 1 ? "Range: " + action.range : '',
                action.minSize > 0 ? "Req. Size: " + action.minSize : '',
                action.cost > 0 ? "Cost: " + action.cost : ''
            ].filter(function (s) { return s.length > 0; }).join(' ');
            if (desc)
                out += div('ui-field', desc);
            if (action.type == 1 /* Attack */) {
                out += div('ui-quote', "Deletes " + (action.power + ' sector' + (action.power != 1 ? 's' : '')) + " from target");
            }
        }
    }
    return div('ui-panel', out);
}
function renderShopInfo() {
    var out = '';
    if (server) {
        out += div('ui-header', server.name);
    }
    out += div('ui-field', "Cash: " + save.money);
    out += div('ui-spacer');
    out += div('ui-button', 'Exit Shop', "exitShop()");
    return div('ui-panel', out);
}
function renderPopup() {
    var out = '';
    if (popupTitle || popupBody) {
        out += div('popup', div('popup-title', popupTitle) + div('popup-body', popupBody));
    }
    return out;
}
function div(className, inner, click) {
    if (inner === void 0) { inner = ''; }
    if (click === void 0) { click = ''; }
    return "<div class=\"" + className + "\" " + (click ? "onclick=\"event.stopPropagation();" + click + "\"" : '') + ">" + inner + "</div>";
}
function grid(x, y, className, inner, click) {
    if (inner === void 0) { inner = ''; }
    if (click === void 0) { click = ''; }
    return "<div class=\"" + className + "\" " + (click ? "onclick=\"event.stopPropagation();" + click + "\"" : '') + " style=\"grid-row:" + (y + 1) + ";grid-column:" + (x + 1) + ";\">" + inner + "</div>";
}
function icon(className) {
    return "<i class=\"" + className + "\"></i>";
}
var GRID_WIDTH = 15;
var GRID_HEIGHT = 10;
var MAX_PATH_LEN = 8;
var PROGRAM_TYPES = [
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
                type: 1 /* Attack */,
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
                type: 1 /* Attack */,
                power: 2,
                range: 1,
                cost: 0,
                minSize: 0
            },
            {
                name: 'Mega Byte',
                type: 1 /* Attack */,
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
                type: 1 /* Attack */,
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
                type: 1 /* Attack */,
                power: 2,
                range: 4,
                cost: 0,
                minSize: 0
            }
        ]
    }
];
var WORLD = {
    servers: [
        {
            name: 'Headquarters',
            desc: 'Your access point to the network.',
            x: 7,
            y: 4,
            type: 0 /* Waypoint */
        },
        {
            name: 'Chromcast Firewall',
            desc: 'Security Level: Low<br>A firewall keeping unauthorized traffic out of private networks. Delete the firewall software to continue onward.',
            x: 7,
            y: 2,
            type: 1 /* Battle */,
            level: {
                type: 0 /* Delete */,
                bg: 'bg0',
                reward: 100,
                programs: [
                    {
                        type: PROGRAM_TYPES.find(function (v) { return v.name == "Guard"; }),
                        body: [{ x: 10, y: 4 }]
                    },
                    {
                        type: PROGRAM_TYPES.find(function (v) { return v.name == "Guard"; }),
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
            type: 1 /* Battle */,
            level: {
                type: 1 /* Retrieve */,
                bg: 'bg1',
                reward: 150,
                programs: [
                    {
                        type: PROGRAM_TYPES.find(function (v) { return v.name == "Guard"; }),
                        body: [{ x: 11, y: 4 }, { x: 12, y: 4 }]
                    },
                    {
                        type: PROGRAM_TYPES.find(function (v) { return v.name == "Guard"; }),
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
            type: 2 /* Shop */,
            stock: [
                PROGRAM_TYPES.find(function (v) { return v.name == "Wolf"; }),
                PROGRAM_TYPES.find(function (v) { return v.name == "Trebuchet"; })
            ]
        }
    ],
    links: [
        { pts: [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }] },
        { pts: [{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }] },
        { pts: [{ x: 7, y: 2 }, { x: 7, y: 3 }, { x: 7, y: 4 }] }
    ]
};
var actx = new AudioContext();
var menuTrack = new Track('mp3/DST-Horizon515.mp3');
menuTrack.play();
var battleTracks = [
    new Track('mp3/DST-impuretechnology.mp3'),
    new Track('mp3/DST-KiloByte.mp3'),
    new Track('mp3/DST-Rendevouz.mp3'),
    new Track('mp3/DST-Robotix.mp3'),
    new Track('mp3/DST-TowerDefenseTheme.mp3'),
    new Track('mp3/DST-TowerDefenseTheme3.mp3'),
];
var soundBufferSelect = null;
loadSound('wav/select.wav', function (buf) { return soundBufferSelect = buf; });
var soundBufferHit = null;
loadSound('wav/hit.wav', function (buf) { return soundBufferHit = buf; });
var soundBufferMove = null;
loadSound('wav/move.wav', function (buf) { return soundBufferMove = buf; });
var soundBufferTarget = null;
loadSound('wav/target.wav', function (buf) { return soundBufferTarget = buf; });
var soundBufferPickup = null;
loadSound('wav/pickup.wav', function (buf) { return soundBufferPickup = buf; });
var soundBufferPurchase = null;
loadSound('wav/purchase.wav', function (buf) { return soundBufferPurchase = buf; });
var save = {
    programs: [
        PROGRAM_TYPES[0],
        PROGRAM_TYPES[0],
        PROGRAM_TYPES[1]
    ],
    servers: [
        true
    ],
    money: 500
};
var selected = null;
var selectedAction = null;
var selectedItem = null;
var phase = 0 /* World */;
var tickDelay = 200;
var tickTimeout = 0;
var programs = [];
var map = [];
var level = null;
var server = null;
var storage = [];
var popupTitle = '';
var popupBody = '';
var popupTimeout = 0;
addEventListener('keydown', function (ev) {
    if (selected && selected.mine && phase == 2 /* Player */ && !popupTitle) {
        var index = programs.indexOf(selected);
        var head = selected.body[0];
        if (ev.key == 'ArrowLeft')
            move(index, head.x - 1, head.y);
        if (ev.key == 'ArrowRight')
            move(index, head.x + 1, head.y);
        if (ev.key == 'ArrowUp')
            move(index, head.x, head.y - 1);
        if (ev.key == 'ArrowDown')
            move(index, head.x, head.y + 1);
        if (ev.key == 'Escape')
            cancel(index);
    }
    if (ev.key == 'Enter')
        changePhase(6 /* Victory */);
});
document.body.addEventListener('click', function (ev) {
    if (selected && phase != 4 /* Enemy */ && phase != 5 /* EnemyAct */ && !popupTitle) {
        if (selected.moves == selected.initialMoves) {
            cancel(programs.indexOf(selected));
        }
        else {
            pass(programs.indexOf(selected));
        }
    }
});
document.addEventListener('visibilitychange', function (ev) {
    if (Track.current) {
        if (document.hidden)
            Track.current.pause();
        else
            Track.current.resume();
    }
});
tick();
render();
