mf.include("task_manager.js");
mf.include("inventory.js");
mf.include("items.js");
mf.include("navigator.js");

var builder = {};

builder.BlockSpec = function(point, block_or_is_block_acceptable_func, placement_choices, placement_description) {
    this.point = point;
    if (block_or_is_block_acceptable_func.constructor === mf.Block) {
        var block = block_or_is_block_acceptable_func;
        this.isBlockAcceptable = block.equals;
        this.placement_choices = [items.itemToPlaceBlock(block)];
        this.placement_description = items.nameForId(block.type);
    } else {
        this.isBlockAcceptable = block_or_is_block_acceptable_func;
        assert.isFunction(this.isBlockAcceptable);
        this.placement_choices = placement_choices;
        assert.isArray(this.placement_choices);
        this.placement_description = placement_description;
        assert.isString(this.placement_description);
    }
};
builder.makeNonSolidBlockSpec = function(point) {
    function isNotPhysical(block) {
        return !mf.isPhysical(block.type);
    }
    return new builder.BlockSpec(point, isNotPhysical, [], "");
};

builder.startBuilding = function(construction_project, task_name, responder_func) {
    var current_buffer = [];
    function getNextBlockSpec() {
        while (current_buffer.length === 0) {
            current_buffer = construction_project.nextGroup();
            if (current_buffer === undefined) {
                return undefined;
            }
        }
        return current_buffer.shift();
    }
    function navigateTo(point, arrived_func) {
        navigator.navigateTo(point, {
            "end_radius": 4,
            "arrived_func": arrived_func,
            "cant_find_func": function() {
                responder_func("can't navigate");
                done();
            },
        });
    }
    function dig(point, callback) {
        function doneEquipping() {
            navigateTo(point, function() {
                mf.onStoppedDigging(function asdf(reason) {
                    mf.removeHandler(mf.onStoppedDigging, asdf);
                    if (reason === mf.StoppedDiggingReason.BlockBroken) {
                        callback();
                    }
                });
                mf.lookAt(point);
                mf.startDigging(point);
            });
        }
        var block_type = mf.blockAt(point).type;
        if (!inventory.equipBestTool(block_type, doneEquipping)) {
            var missing_tools = items.toolsForBlock(block_type);
            var tool_name;
            if (missing_tools === items.tools.shovels) {
                tool_name = "shovel";
            } else if (missing_tools === items.tools.pickaxes) {
                tool_name = "pick";
            } else  if (missing_tools === items.tools.axes) {
                tool_name = "axe";
            } else if (missing_tools === undefined) {
                current_block_spec = undefined;
                callback();
                return;
            } else {
                tool_name = items.nameForId(missing_tools[0]);
            }
            responder_func("need a " + tool_name);
            done();
        }
    }
    function place(point, block) {
        // TODO: metadata
        function doneEquipping() {
            navigateTo(point, function () {
                if (builder.placeEquippedBlock(point)) {
                    dealWithNextThing();
                } else {
                    responder_func("can't place block");
                    done();
                }
            });
        }
        return inventory.equipItem(block.type, doneEquipping);
    }
    var current_block_spec = undefined;
    function dealWithNextThing() {
        while (true) {
            if (!running) {
                return;
            }
            if (current_block_spec === undefined) {
                current_block_spec = getNextBlockSpec();
            }
            var current_block = mf.blockAt(current_block_spec.point);
            if (current_block_spec.isBlockAcceptable(current_block)) {
                // done with this block
                current_block_spec = undefined;
                continue;
            }
            if (mf.isDiggable(current_block.type)) {
                // get this outta the way
                dig(current_block_spec.point, dealWithNextThing);
                return;
            }
            // put the right thing here
            var placement_choices = current_block_spec.placement_choices;
            for (var i = 0; i < placement_choices.length; i++) {
                var item = placement_choices[i];
                if (place(current_block_spec.point, current_block_spec.block, dealWithNextThing)) {
                    return;
                }
            }
            responder_func("out of " + current_block_spec.placement_description);
            done();
        }
    }
    var running;
    var timeout;
    function start() {
        running = true;
        responder_func("drilling");
        dealWithNextThing();
    }
    function done() {
        stop();
        task_manager.done();
    }
    function stop() {
        if (timeout !== undefined) {
            mf.clearTimeout(timeout);
        }
        running = false;
        mf.stopDigging();
        navigator.stop();
    }
    task_manager.doLater(new task_manager.Task(start, stop, task_name));
};

builder.placeEquippedBlock = function(point) {
    // try placing on any face that will work
    var faces = [
        mf.Face.NegativeX,
        mf.Face.PositiveX,
        mf.Face.NegativeY,
        mf.Face.PositiveY,
        mf.Face.NegativeZ,
        mf.Face.PositiveZ,
    ];
    var vectors = [
        new mf.Point( 1,  0,  0),
        new mf.Point(-1,  0,  0),
        new mf.Point( 0,  1,  0),
        new mf.Point( 0, -1,  0),
        new mf.Point( 0,  0,  1),
        new mf.Point( 0,  0, -1),
    ];
    for (var i = 0; i < faces.length; i++) {
        var other_point = point.plus(vectors[i]);
        if (mf.canPlaceBlock(other_point, faces[i])) {
            mf.hax.placeBlock(other_point, faces[i]);
            return true;
        }
    }
    return false;
}
