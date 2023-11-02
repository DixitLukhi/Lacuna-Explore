/*
	HTML source editor.
	Niels Groot Obbink
*/

'use strict';



require('./native_extentions');

const file_system = require('fs'),
esprima = require('espree'),
path = require("path");



module.exports = function()
{
	this.file_name = null;
	this.source = null;
	this.original_source = null;
	this.functions = null;
	this.dstFolder = null; // source folder of the project
 


	this.load = function(file_name, source, dstFolder)
	{
		this.dstFolder = dstFolder;
		if(file_name)
		{
			this.file_name = file_name;
			this.original_source = this.source = source;

			// Also retrieve and save a list of all functions in this script file.
			this.functions = this.get_functions( this.source );
		}
	};


	this.save = function()
	{
		if(this.file_name == null)
		{
			return;
		}

		file_system.writeFileSync( path.join(this.dstFolder, this.file_name), this.source );
	};



	this.restore = function()
	{
		this.source = this.original_source;

		this.save();
	};



	this.add_log_calls = function(logger)
	{
		let log_call,
		    offset = 0,
		    new_source = this.source;	// Start with the original source.

		for(let i = 0; i < this.functions.length; i++)
		{
			let this_function = this.functions[i];

			// Create a log call for this function.
			log_call = logger(this.file_name, this_function.start, this_function.end);

			// Insert the log call in the source.
			// Starting character position is function body location (plus one for the { character) plus length of all previously inserted log calls.
			new_source = new_source.insert(this_function.body.start + 1 + offset, log_call);

			// Increment the offset with the length of the log call, so the next insertion is at the right place.
			offset += log_call.length;
		}

		this.source = new_source;
	};



	this.get_functions = function(source)
	{
		let functions = [];

		let last_function = null;

		const ast = esprima.parse(source, {ecmaVersion: 14,
			range: true, 
			ecmaFeatures: {
			   jsx: true,
			   globalReturn: true
			}});

		traverseAST(ast, (node) => {
			// Process each node here
			if(node.type == 'FunctionDeclaration' || node.type == 'FunctionExpression')
			{
				let containing_function = last_function;
				last_function = node;

				// Gather the data for this function in a abbreviated format.
				let function_data =
				{
					start: node.range[0],
					end: node.range[1],
					body:
					{
						start: node.body.range[0],
						end: node.body.range[1]
					}
				};

				if(node.type == 'FunctionDeclaration')
				{
					function_data.type = 'declaration';
					function_data.name = node.id.name;
				}else{
					// If it's not a FunctionDeclaration it must be a FunctionExpression.
					function_data.type = 'expression';
				}

				// Save the function data.
				functions.push(function_data);
			}
		  });

		// Esprima doesn't return an ordered node list, so sort the functions based on starting position.
		functions = functions.sort(function(a, b)
		{
			return a.start - b.start;
		});

		return functions;
	};
};

function traverseAST(ast, callback) {
	callback(ast);
  
	for (const node in ast) {
	  if (ast[node] && typeof ast[node] === 'object') {
		traverseAST(ast[node], callback);
	  }
	}
}