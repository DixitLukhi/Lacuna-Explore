
/**
 * @author Ishas Kulkarni   
 * @description js-callgraph adapter for lacuna's static, nativecalls and ACG analyzers
 * 
 * @repository https://github.com/gaborantal/js-callgraph
 * @repository Forked repository adapted for lacuna : https://github.com/ishaskul/js-callgraph
 */

const path = require("path"),
	child_process = require("child_process"),
    fs = require('fs'),
    logger = require("../_logger"),
    acg = require('../analyzers/acg.js'),
    lacunaSettings = require("../_settings");


module.exports = function()
{
	this.run = function(runOptions, callGraph, scripts, callback) {
		var entryDirectory = runOptions.directory;
        var analyzer = runOptions.currentlyRunningAnalyzer;
		
		jsCallgraphAnalyzer(entryDirectory, analyzer, edges => {
        /* {caller: {file, start}, callee: {file, start} } */
            if (analyzer === 'acg') {
                let scriptSrcs = scripts.map(s => {
                    let entryDir = path.dirname(path.join(runOptions.directory, runOptions.entry));
                    return path.join(entryDir, s.src);
                });
                edges.forEach(function (edge) {
                    var edgeWeight = lacunaSettings.STATIC_ANALYSERS_DEFAULT_EDGE_WEIGHT; 
                    /* fix all file issues */
                    edge.caller.file = acg.getSrcPath(acg.basenameToScriptSrc(edge.caller.file, scriptSrcs), runOptions);
                    edge.callee.file = acg.getSrcPath(acg.basenameToScriptSrc(edge.callee.file, scriptSrcs), runOptions);
    
                    if (!callGraph.nodeExists(edge.caller)) { 
                        edge.caller = callGraph.assertRootNode({ file: edge.caller.file, range: [null, null] }, true);
                    }
                    
                    callGraph.addEdge(edge.caller, edge.callee, "acg", false, edgeWeight);
                });
            }  
             else if (analyzer === 'nativecalls') {
                 edges.forEach(function(edge)
                 {
                    var edgeWeight = lacunaSettings.STATIC_ANALYSERS_DEFAULT_EDGE_WEIGHT;
                     edge.caller.file =  getSrcPath(path.relative(process.cwd(), edge.caller.file), runOptions);
                     edge.callee.file = getSrcPath(path.relative(process.cwd(), edge.callee.file), runOptions);
                     callGraph.addEdge(edge.caller, edge.callee, "nativecalls", false, edgeWeight);
                 });
                 return callback(edges);
             } 
            else { // static analyzer     
            edges.forEach(function (edge) {
                var edgeWeight = lacunaSettings.STATIC_ANALYSERS_DEFAULT_EDGE_WEIGHT;
                if (!edge.caller || !edge.callee) { return; }
                /* Creates a valid relativePath to sourceDir (instead of pwd)*/
                edge.caller.file =  getSrcPath(path.relative(process.cwd(), edge.caller.file), runOptions);
                edge.callee.file = getSrcPath(path.relative(process.cwd(), edge.callee.file), runOptions);
				callGraph.addEdge(edge.caller, edge.callee, analyzer, false, edgeWeight);
			});

            }
            
            return callback(edges);
		});
	};
};


/**
 * Actually running the js-callgraph analyzer
 * passed the edges retrieved from the js-callgraph output to callback function
 * 
 * js-analyser writes the callgraph edges it found for each analyzer to respective json files
 * (edges-acg.json, edges-nativecalls.json, edges-static.json)
 */
function jsCallgraphAnalyzer(entryDirectory, analyzer,  callback) {
    var pathToAnalyzer = path.join(__dirname, 'js-callgraph', 'js-callgraph.js');
    var lacunaCachePath = path.join(entryDirectory, lacunaSettings.LACUNA_OUTPUT_DIR);
    var pathForStoringCG = path.join(lacunaCachePath, 'js-cg.json');
    var strategy = analyzer === 'acg' ? 'ONESHOT' : 'DEMAND'
    let command = `node ${pathToAnalyzer} --strategy ${strategy} --cg --analyzertype ${analyzer} --output ${pathForStoringCG} ${entryDirectory}`
    
    console.log(command);
    child_process.exec(command, function (error, stdout, stderr) {
        if(error) {
            throw logger.error(error);
        }
        console.log(stdout)
        if (analyzer === 'acg') {
            var edges = getACGEdges(lacunaCachePath);
        } else {
            var edges = getAnalyzerEdges(lacunaCachePath, analyzer)
        }
		callback(edges);
	});
}


/**
 * Converts the ACG edges from js-callgraph analyzer to lacuna's acceptable format
 * and retruns the edges as per the format required by lacuna
 * 
 * Returns:
 *  edges [{
 *  caller: {file: <String>, start: { line: groups.line, column: groups.column }}
 *  callee: {file: <String>, start: { line: groups.line, column: groups.column }}
 * }]
 */
function getACGEdges(entryDirectory) {
    var cgEdgesFilePath = path.join(entryDirectory, 'edges-acg.json');
    if (fs.existsSync(`${cgEdgesFilePath}`)) {
        const acgEdgesJsonData = fs.readFileSync(cgEdgesFilePath, 'utf-8');
        const parsedCGEdgesObject = JSON.parse(acgEdgesJsonData);
        if (Object.keys(parsedCGEdgesObject).length != 0) {
            var edges = acg.acgToLacunaFormatter(parsedCGEdgesObject)

            return edges;
        } else {
            logger.warn("ACG: No Edges found");
        }

      } else {
        throw logger.error("ACG: there was a problem getting CG edges");
      }
}

/**
 * Retruns the edges retrieved from js-callgraph analyzer
 * 
 * Applicable for static and nativecalls analyzers
 * 
 * Returns:
 *  edges [{
 *  caller: {file: <String>, start: { line: groups.line, column: groups.column }}
 *  callee: {file: <String>, start: { line: groups.line, column: groups.column }}
 * }]
 */
function getAnalyzerEdges(entryDirectory, analyzer) {
    var cgEdgesFilePath = path.join(entryDirectory, `edges-${analyzer}.json`);
    if (fs.existsSync(`${cgEdgesFilePath}`)) {
        const analyzerEdgesJsonData = fs.readFileSync(cgEdgesFilePath, 'utf-8');
        const parsedCGEdgesObject = JSON.parse(analyzerEdgesJsonData);
        if (Object.keys(parsedCGEdgesObject).length != 0) {
            var edges = parsedCGEdgesObject;

            return edges;
        } else {
            logger.warn("No Edges found");
        }

      } else {
        throw logger.error("there was a problem getting CG edges");
      }
}



/**
 * Converts a path relative to pwd to a path relative to the sourceDirectory
 */
function getSrcPath(pwdPath, runOptions) {
    var srcPath = path.normalize(pwdPath).trim();
    var dir = runOptions.directory; /* already normalized */

    if (dir != srcPath.slice(0, dir.length)) {
        console.log("[getSrcPath] invalid path: ", srcPath);
    }
    return srcPath.slice(dir.length);
}