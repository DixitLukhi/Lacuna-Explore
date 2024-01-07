
/**
 * @author Ishas Kulkarni   
 * @description Jelly adapter for Lacuna
 * 
 * @repository https://github.com/cs-au-dk/jelly
 * @repository Forked repository adapted for lacuna : https://github.com/ishaskul/jelly
 */

const path = require("path"),
	child_process = require("child_process"),
    fs = require('fs'),
    logger = require("../_logger"),
    lacunaSettings = require("../_settings");



module.exports = function()
{
	this.run = function(runOptions, callGraph, scripts, callback) {
		var entryDirectory = runOptions.directory
		
		jellyAnalyzer(entryDirectory, edges => {
        /* {caller: {file, start}, callee: {file, start} } */
            
            edges.forEach(function (edge) {
                var edgeWeight = lacunaSettings.STATIC_ANALYSERS_DEFAULT_EDGE_WEIGHT;
                if (!edge.caller || !edge.callee) { return; }
                /* Creates a valid relativePath to sourceDir (instead of pwd)*/
                edge.caller.file = getSrcPath(edge.caller.file, runOptions);
                edge.callee.file = getSrcPath(edge.callee.file, runOptions);

                /* Convert the nodeData to functionData */
                edge.caller = callGraph.convertToFunctionData(edge.caller);
                edge.callee = callGraph.convertToFunctionData(edge.callee);

				/* Add the edge to the callGraph */
				callGraph.addEdge(edge.caller, edge.callee, "jelly", false, edgeWeight);
			});

			return callback(edges);
		});
	};
};


/**
 * Actually running the Jelly analyzer
 * also converts the Jelly output to lacuna edges
 */
function jellyAnalyzer(entryDirectory, callback) {
    var pathToJellyAnalyzer = path.join(__dirname, 'jelly', 'lib/main.js');
    var pathForStoringCG = path.join(entryDirectory, lacunaSettings.LACUNA_OUTPUT_DIR, 'jelly-callgraph.json');
    var pathForCallGraphText = path.join(entryDirectory,lacunaSettings.LACUNA_OUTPUT_DIR,'jelly-callgraph.txt');
    let command = `node ${pathToJellyAnalyzer} -j ${pathForStoringCG} -c${pathForCallGraphText} --callgraph ${entryDirectory}`
    
    console.log(command);
    child_process.exec(command, function (error, stdout, stderr) {
        if(error) {
            throw logger.error(error);
        }
        console.log(stdout)
        var edges = jellyToLacunaFormatter(stdout, pathForCallGraphText);
		callback(edges);
	});
}

    
/**
 * Formats the output of jelly to a more Lacuna friendly one
 * 
 * Expected jelly output:
 * example/simple.output/lacuna_cache/exported_lt91kz.js:15:10:15:61->
 * example/simple.output/lacuna_cache/exported_lt91kz.js:3:5
 * 
 * For parsing this we make the following assumptions:
 *  - All caller callee relations will adhere to the same format:
 *     <functionName> at <filename>:<rowNum>:<colNum> may be called from:
 *     __<filename>:<rowNum>:<colNum>
 *      (etc.)
 * 
 * Returns:
 *  edges [{
 *  caller: {file: <String>, start: { line: groups.line, column: groups.column }}
 *  callee: {file: <String>, start: { line: groups.line, column: groups.column }}
 * }]
 * 
 */
function jellyToLacunaFormatter(output, path) {
        var edges = [];
        var callee = null;
        if(output.includes(`Call graph written to ${path}`)) {
            try {
                const cgData = fs.readFileSync(path)
                .toString('UTF8')
                .split('\n');
                if (cgData.length != 0) {
                    cgData.forEach(function(cgLine) {
                        var callerCalleeSeparated = cgLine.split("->");
                        if (callerCalleeSeparated[0] != "") {
                        var callerData = callerCalleeSeparated[0].split(":");
                        var calleeData = callerCalleeSeparated[1].split(":");
                        var caller = { file: callerData[0], start: { line: parseInt(callerData[1]), column: parseInt(callerData[2] - 1) } };
                        callee = { file: calleeData[0], start: { line: parseInt(calleeData[1]), column: parseInt(calleeData[2] - 1) } };
                        edges.push({caller: caller, callee: callee});
                        }
                    });
                    return edges;
                } else {
                    throw logger.error("Call Graph is empty");
                }
              } catch (error) {
                throw logger.error("Error reading from the CG: " + error);
              }
        }
    }

/**
 * Converts a path relative to pwd to a path relative to the sourceDirectory
 */
function getSrcPath(pwdPath, runOptions) {
    var srcPath = path.normalize(pwdPath).trim();
    var dir = runOptions.directory; /* already normalized */
    const index = srcPath.indexOf(dir); // get index of dir in absolute path returned by jelly
    if (index != -1) { // if index is -1, that means index hasn't been found
        const relativePath = srcPath.substring(index);
        if (dir != relativePath.slice(0, dir.length)) {
            console.log("[getSrcPath] invalid path: ", srcPath);
        }
        return relativePath.slice(dir.length);
    } else {
        console.log("[getSrcPath] invalid path: ", srcPath);
    }
}