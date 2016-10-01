(function(undefined) {
	"use strict";

	var
		TYPEOF_STRING = "string",
		TYPEOF_BOOLEAN = "boolean",
		TYPEOF_OBJECT = "object",
		TYPEOF_FUNCTION = "function",
		TYPEOF_NUMBER = "number",

		d = document,
		w = window,
		qsa = function(sel, context) {
			return (context || d).querySelectorAll(sel);
		},
		HC = HTMLCollection,
		NL = NodeList,
		DF = DocumentFragment,
		D = Document,
		N = Node,
		EN = Element, // Element node
		ar = Array,
		ap = ar.prototype,
		ai_every = "every",
		ai_some = "some",
		isArr = ar.isArray,
		objKeys = Object.keys,
		urlencode = function(str) {
			return encodeURIComponent(str).replace(/%20/g, '+');
		},
		nil = null,
		gen_func = function() {},
		is_probably_array_like = function(obj) {
			// Arrays are objects
			if (typeof obj != TYPEOF_OBJECT) {
				return false;
			}

			// Object provided is true array
			if (isArr(obj)) {
				return true;
			}

			// Arrays have a length property that is a positive integer
			var length = obj.length;
			if (!Number.isInteger(length) || length < 0) {
				return false;
			}

			// Arrays have an inherited property .length
			// WARNING: .getOwnPropertyDescriptor is buggy and doesn't work for (at least) NodeLists in Chrome
			if (objKeys(obj).indexOf('length') > -1) {
				return false;
			}

			// Arrays' .length property cannot be deleted
			// WARNING: delete is buggy, may return true or false but .length still remains
			delete obj.length;
			if (length !== obj.length) {
				// Restore property
				obj.length = length;
				return false;
			}

			// Assume that above checks were accurate and that there are no other checks
			return true;
		},

	/*
		Local zQuery object to set up and return
	*/

		zQuery = function(source, parseType) {
			var nodes, tmp;

			// Create from Document's entry element
			if (source instanceof D)
			{
				nodes = [source.documentElement];
			}

			// Create from DocumentFragment's children
			else if (source instanceof DF)
			{
				nodes = zQ_fn_import_DF(source);
			}

			// Parse valid HTML into element objects
			// or find elements matching selector in whole document
			// or parse XML and get entry element
			else if (typeof source == TYPEOF_STRING)
			{
				source = source.trim();
				if (parseType == 'xml') {
					tmp = (new DOMParser).parseFromString(source, 'text/xml');
					if (tmp.getElementsByTagName('parsererror').length) {
						throw new SyntaxError("Invalid XML");
					}
					node = [tmp.documentElement];
				} else {
					nodes = source[0] == '<' ?
						zQ_fn_parseHTML(source) :
						zQ_fn_clone_array(qsa(source));
				}
			}

			// Create from single Node
			else if (source instanceof N || source == w)
			{
				nodes = [source];
			}

			// Convert HTMLCollection/NodeList/array-like object to generic array, or shallow-copy provided array
			else if (is_probably_array_like(source))
			{
				nodes = zQ_fn_clone_array(source);
			}

			else
			{
				throw new TypeError("Unrecognised source");
			}

			// Cache length and create public method to return private array
			// NOTE: Allow exception to be thrown if no "length" property accessible (e.g. on non-objects)
			this.length = nodes.length;
			this.get = function(no) {
				if ((no | 0) === no) {
					if (no < 0) {
						no = nodes.length + no;
					}
					return no < 0 || no >= nodes.length ? nil : nodes[no];
				} else {
					// Don't allow modification of original array
					return zQ_fn_clone_array(nodes);
				}
			};
		},

		p = zQuery.prototype,

		// Returned public-facing function
		$ = function(selOrElements) {
			return new zQuery(selOrElements);
		},

		/*
			Internal functions and variables
		*/

		zQ_set_prop_eventListeners = '_zqel',
		zQ_set_regexp_whitespace = /\s+/,
		zQ_set_regexp_captureEvents = /^(load|focus|blur|scroll|mouse(enter|leave))$/i,
		zQ_set_regexp_handlebars = /{{\s*([$_a-zA-Z][$_a-zA-Z0-9]*)\s*}}/g,

		/*
			Merge all other provided arrays to the first provided array
			-- WARNING: Applies directly, returns *original*, does **NOT** return a new array
			-- NOTE: Does not work on array-like objects, as it works on the original object
			-- TIP: Pass in [] as first argument to create new array (i.e. concat)
		*/
		zQ_fn_merge_arrays = function(a1) {
			// DO NOT use zQ_fn_iterate function, as that function uses this function, creating a loop
			for (var i = 1, toMerge; toMerge = arguments[i]; ++i) {
				ap.push.apply(a1, toMerge);
			}
			return a1;
		},

		// Shallow-clones array and array-like objects without altering original
		// Also used to create a new generic array from array-like objects
		zQ_fn_clone_array = function(arr) {
			return ap.slice.call(arr);
		},

		// Returns a generic array containing deep-cloned elements of provided DocumentFragment
		zQ_fn_import_DF = function(docfrag) {
			return zQ_fn_clone_array(d.importNode(docfrag, true).childNodes);
		},

		// Code copied from mustache.js (https://mustache.github.io/)
		zQ_fn_escape_HTML = function(str) {
			return ("" + str).replace(/[&<>"'\/]/g, function(entity) {
				return zQ_set_entityMap[entity];
			});
		},

		zQ_set_entityMap = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': '&quot;',
			"'": '&#39;',
			"/": '&#x2F;'
		},

		zQ_fn_serialise_object = function(obj) {
			var result = '';
			zQ_fn_iterate_object(obj, function(prop, value) {
				result += '&' + urlencode(prop) + '=' + urlencode(value);
			});
			return result.slice(1);
		},

		zQ_fn_parseHTML = function(html) {
			/*
				Code inspired by jQuery 2 source (https://jquery.com/)

				WARNING: May return empty array, which is == false but TRUTHY
			*/

			// OVERRIDE: HTML may start with text
			// if (html[0] == '<') {

			var tag = zQ_set_regexp_tag.exec(html)[1].toLowerCase(),
				parser,
				wrap,
				i;
			/*
				PROBLEM: Can't create <html>, <head> or <body> inside temporary <div>.
				SOLUTION: Use DOMParser.
			*/
			if (/^(html|head|body)$/.test(tag)) {
				(parser = (new DOMParser).parseFromString(html, 'text/html')).html = parser.documentElement;

				// Only return <html> if empty single HTML tag, not <html><head></head><body></body></html>
				// WARNING: Returned array-like objects cannot do special array methods of calculating emptiness such as !([] + []) or [] == false
				// NOTE: Can't use getElementsBy... or qSA as they don't include text nodes
				// WARNING: Will always return single <html> element if <head> and <body> empty, even if provided in string
				return [
					parser[tag].cloneNode(tag != 'html' || !!(parser.head.childNodes.length + parser.body.childNodes.length))
				];
			}

			/*
				PROBLEM: Creating script tag inside temporary <div> will cause it to load its script if 'src' property is set before attaching to real document, making it a dud when appended to real document.
				SOLUTION: Don't clone node when <script> element found, create a new one instead.
				WARNING: Some properties may not be cloned.
			*/
			else {
				wrap = zQ_set_wrapMap[tag] || [0, '', ''];
				parser = d.createElement('div');
				parser.innerHTML = wrap[1] + html + wrap[2];
				i = wrap[0];
				while (i--) {
					parser = parser.lastChild;
				}
				// Must clone all child nodes of parse container (<div>) to detach them from the parser
				return ap.map.call(parser.childNodes, function(c) {
					if (c.nodeName.toLowerCase() == 'script') {
						var clone = d.createElement('script');
						// defer and async are ignored because all dynamic JS are loaded asynchronously
						[
							'text', 'type', 'src',
							'integrity', 'crossorigin', 'charset',
							'id', 'className',
							'onload', 'onerror'
						].forEach(function(prop) {
							clone[prop] = c[prop];
						});
						return clone;
					}
					return c.cloneNode(true);
				});
			}
		},

		zQ_set_wrapMap = {
			// When constructing from HTML string, assorted <table> elements are automatically constructed if not in string, leading to unwanted extra elements. Detect potential self-insertion, insert/complete structure manually, and then remove them.
			// Code copied from jQuery 2 source (https://jquery.com/)
			thead: [ 1, "<table>", "</table>" ],
			col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
			tr: [ 2, "<table><tbody>", "</tbody></table>" ],
			td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
			th: [ 3, "<table><thead><tr>", "</tr></thead></table>" ]
		},
		// Matches the first tag's name in an HTML string
		// Code copied from jQuery 2 source (https://jquery.com/)
		zQ_set_regexp_tag = /<([\w:-]+)/,

		/*
			Walk through zQuery/NodeList/HTMLCollection/Array object's HTMLElements, optionally filtering it to create a new zQuery object.
			NOTE: To keep consistency, use this function to iterate over arrays and array-like objects containing HTMLElements. It is preferred over forEach or for loops as it definitely works on array-like objects and will be shorter (in code length) on minification. There may be a small performance loss when using this function.

			WARNING: Do not use to iterate over array(-like)s containing falsey values.
		*/
		zQ_fn_iterate = function(zQ, fn, ret) {
			var elems = zQ instanceof zQuery ? zQ.get() : zQ,
				elems_count = elems.length,
				i = 0,
				elem,
				result,
				results;

			if ((ret = ret !== false)) {
				results = [];
			}

			/* OVERRIDE: Unsure about use and compatibility
			else if (!elems_count) {
				// Don't iterate if not returning and nothing to iterate (i.e. no elements or invalid variable)
				return;
			}
			*/

			for ( ; elem = elems[i]; ++i) {
				var result = fn(elem, i, elems_count);
				// Break on false, but still return if required
				if (result === false) {
					break;
				}

				if (ret && result) {
					// Don't just check for .length as some objects have a length property (e.g. parentNode)
					if (result instanceof HC || result instanceof NL || isArr(result)) {
						zQ_fn_merge_arrays(results, result);
					} else if (result instanceof N) {
						results.push(result);
					}
				}
			}
			if (ret) {
				return $(results);
			}
		},

		zQ_fn_iterate_object = function(object, fn) {
			objKeys(object).forEach(function(prop, i) {
				fn(prop, object[prop], object, i);
			});
		},

		zQ_fn_matches = function(elem, match) {
			/*
				Returns if
					(String) selector,
					(Object) Element, or
					at least one Element inside (Object) HTMLCollection/NodeList/zQuery
				matches Element {elem}
			*/
			if (typeof match == TYPEOF_STRING) {
				return elem.matches(match);
			}
			if (match instanceof EN) {
				return elem === match;
			}

			// Assuming {match} is zQuery or HTMLCollection or NodeList
			var result = false;
			zQ_fn_iterate(match, function(m) {
				// If match, set {result} to true and return false (break),
				// else set {result} to false and return true (does nothing)
				return !(result = elem === m);
			}, false);
			return result;
		},

		zQ_fn_filter = function(elems, matches) {
			// Filters elements {elems} and returns what matches elements in {matches}
			return ap.filter.call(elems, function(elem) {
				return zQ_fn_matches(elem, matches);
			});
		},


		// NOTE: (insert)Before/After don't work when there is no parent (e.g. a parsed HTML Element or root node)
		zQ_fn_appendPrepend = function(mode, switch_roles, elems, nodes) {
			/*
				Modes:
					0: prepend, prependTo
					1: append, appendTo
					2: before, insertBefore,
					3: after, insertAfter

				When using as appendTo or prependTo, it returns a new zQuery object containing all the HTMLElements that were appended (including clones), not just the original ones.

				When using as append or prepend, it returns the original zQuery object as usual.
			*/

			if (typeof nodes == TYPEOF_STRING) {
				nodes = switch_roles ? qsa(nodes) : zQ_fn_parseHTML(nodes); // Parse HTML and use elements if any valid; otherwise create a textNode or find the appropriate elements to modify
			} else if (nodes instanceof N) {
				nodes = [nodes];
			} else if (nodes instanceof HC || nodes instanceof NL) {
				nodes = zQ_fn_clone_array(nodes); // Prevent possible infinite loop or duplication with live lists
			}

			if (switch_roles) {
				nodes = [elems, elems = nodes][0]; // Switch the roles of the provided elements (wait until after possibility of querySelectorAll from string
				var newElems = [];
			}

			// Ensure nodes is an array so that it can be reversed (see next statement)
			if (nodes instanceof zQuery) {
				nodes = nodes.get();
			}

			/* Reverse the order of the array if prepending/beforing as the nodes are added before the element in order.
				-- EXAMPLE:
					If [node1, node2, node3] is prepended to DOMElem1 with a parent of Parent1, the result without reversal would be:

					- Parent1
						- node3
						- node2
						- node1
						- DOMElem1

					This is because the nodes are added in order:

					Iteration 1:           Iteration 2:           Iteration 3:
					====================   ====================   ====================
					- Parent1              - Parent1              - Parent1
						- node1                - node2                - node3
						- DOMElem1             - node1                - node2
						                       - DOMElem1             - node1
											                          - DOMElem1

					Therefore reversal is needed to keep the original order of the nodes to be added.
			*/
			if (!(mode % 2)) {
				nodes.reverse();
			}
			zQ_fn_iterate(elems, function(elem, i, t) {
				zQ_fn_iterate(nodes, function(node) {
					// Append/prepend (move) original only on last element to modify (t - 1), as otherwise the nodes to append/prepend will just move between the elements
					if (i < t - 1) {
						node = node.cloneNode(true);
					}
					if (switch_roles) {
						newElems.push(node);
					}
					if (mode == 1) {
						elem.appendChild(node);
					} else {
						(mode ? elem.parentNode : elem).insertBefore(node, (!mode ? elem.childNodes[0] : mode == 2 ? elem : elem.nextSibling) || nil); // Insert before all nodes, even text (so don't use .children); null must be passed if no childNodes to avoid errors
					}
				}, false);
			}, false);
			return switch_roles ? $(newElems) : elems;
		},

		// WARNING: Does not get text nodes
		zQ_fn_prevNext = function(mode, all, elems, sel) {
			return zQ_fn_iterate(elems, function(elem) {
				var ret = [];
				do {
					elem = elem[mode + 'ElementSibling'];
					// Always add to array if no selector, otherwise add only if matches selector
					if (elem && (sel ? zQ_fn_matches(elem, sel) : true)) {
						ret.push(elem);
					}
				} while (all && elem);
				return ret;
			});
		},

	/*
		Compatibility
	*/

		ENp = EN.prototype;
		ENp.matches = ENp.matches || ENp.webkitMatchesSelector || ENp.msMatchesSelector;


	/*
		Set up methods
	*/
	p.reflow = function() {
		zQ_fn_iterate(this, function(elem) {
			elem.offsetHeight;
		}, false);
		return this;
	};

	p.each = function(fn) {
		zQ_fn_iterate(this, fn, false);
		return this;
	};

	p.eq = function(no) {
		return (no = this.get(no)) ? $(no) : nil;
	};

	p.slice = function(start, end) {
		return $(this.get().slice(start, end));
	};

	p.add = function(elems) {
		if (elems) {
			var current = this.get();
			// Create new zQuery element from current zQuery Element objects and provided Element
			if (elems instanceof EN) {
				current.push(elems); // Cannot merge with next line as .push returns pushed element, not the array it modified
				return $(current);
			}

			/*
				Create new zQuery from current zQuery HTMLElement objects and...
				1) (if string) elements matching string selector in whole document
				2) (if zQuery) HTMLElement objects from adding zQuery object
				3) (other) {elems}
			*/
			var arr = elems instanceof zQuery ? elems.get() : typeof elems == TYPEOF_STRING ? qsa(elems) : elems;
			return $(zQ_fn_merge_arrays(current, arr));
		}
		return this;
	};

	// WARNING: Does not clone event listeners
	p.clone = function() {
		return zQ_fn_iterate(this, function(elem) {
			return elem.cloneNode(true);
		});
	};

	/*
		If a string prefixed with '!' or '?' is provided, it will return a boolean.
			-- It returns true if '?' is provided and at least one descendant matches the selector.
			-- It returns true if '!' is provided and all descendants match the selector.
			-- It returns false otherwise.
			// NOTE: The matches search will search in a horizontal fashion rather than vertical, i.e. it will check if any child matches the selector first, and then check if any of their children match the selector, and so on.
		If anything else is provided, it will find all descendants of all elements matching the provided selector/object.
	*/
	p.find = function(sel) {
		var requireAll,
			toCheck = [],
			elem,
			isMatching,
			returnBool,
			toRet = [];

		if (sel === undefined) {
			return zQ_fn_iterate(this, function(elem) {
				return elem.getElementsByTagName('*');
			});
		}
		if (typeof sel == TYPEOF_STRING) {
			if ((returnBool = (requireAll = sel[0] == '!') || sel[0] == '?')) {
				sel = sel.slice(1);
			} else {
				return zQ_fn_iterate(this, function(elem) {
					return qsa(sel, elem);
				});
			}
		}

		// Get the initial list of children
		zQ_fn_iterate(this, function(node) {
			if (node.children) {
				zQ_fn_merge_arrays(toCheck, node.children)
			}
		}, false);

		// Loop through children, appending its children to the list
		while (elem = toCheck.shift()) {
			// Check if it matches
			isMatching = zQ_fn_matches(elem, sel);

			if (isMatching) {
				// Return {true} if it matches and only a boolean is wanted
				if (returnBool) {
					if (!requireAll) {
						return isMatching;
					}
				}
				// Add the matching element if a new zQuery object is wanted
				else {
					toRet.push(elem);
				}
			}

			// If it doesn't match, a boolean is wanted, and all descendants must match, return {false}
			else if (returnBool && requireAll) {
				return isMatching;
			}

			// Add more descendants to check later
			// NOTE: elem should be an element (node type 1) so it definitely has the .children property
			zQ_fn_merge_arrays(toCheck, elem.children);
		}
		return returnBool ? isMatching : $(toRet);
	};

	p.filter = function(selOrFn) {
		/*
			Provide a function to manually decide what to include in the new zQuery object by returning HTMLElements or arrays containing them inside the function

			Provide a selector or any valid HTMLElement-related object (zQuery, HTMLCollection, NodeList, HTMLElement) to filter based on them
		*/
		if (typeof selOrFn == TYPEOF_FUNCTION) {
			return zQ_fn_iterate(this, selOrFn);
		}
		return $(zQ_fn_filter(this.get(), selOrFn));
	};

	p.parent = function(sel) {
		return zQ_fn_iterate(this, function(elem) {
			var parent = elem.parentNode;

			// Do not get root nodes
			if (parent instanceof D) {
				return nil;
			}

			if (sel) {
				if (zQ_fn_matches(elem, sel)) {
					return parent;
				}
			} else {
				return parent;
			}
		});
	};

	// WARNING: Returns -1 on non-elements
	p.index = function(child) {
		var current = this.get(0);
		if (child instanceof zQuery) {
			child = child.get(0);
		} else if (child instanceof HC || child instanceof NL || isArr(child)) {
			child = child[0];
		}
		return ap.indexOf.call((child ? current : current.parentNode).children, child || current);
	};

	['prev', 'next', 'prevAll', 'nextAll'].forEach(function(name) {
		var all = name.slice(4),
			mode = name.slice(0, 4);
		if (~mode.indexOf('v')) {
			mode += 'ious';
		}
		p[name] = function(sel) {
			return zQ_fn_prevNext(mode, all, this, sel);
		};
	});

	// NOTE: Very similar to zQ_fn_prevNext, but not using it due to the overhead of multiple constructions, array manipulations and functions
	// NOTE: Will only get sibling elements (node type 1), even if itself is text or some other node
	p.siblings = function(sel) {
		return zQ_fn_iterate(this, function(elem) {
			var ret = [];
			zQ_fn_iterate(elem.parentNode.children, function(sibling) {
				if (sibling !== elem && (sel ? zQ_fn_matches(sibling, sel) : true)) {
					ret.push(sibling);
				}
			}, false);
			return ret;
		});
	};

	p.closest = function(sel) {
		/*
			From each element, test if itself equals the selector. Keep repeating for the parent if false. If reached root, remove that element from the list; otherwise, add the matched element to the list.
		*/
		return zQ_fn_iterate(this, function(elem) {
			while (elem instanceof EN && !zQ_fn_matches(elem, sel)) {
				elem = elem.parentNode;
			}
			return elem instanceof D ? nil : elem;
		});
	};

	/*
		If a string prefixed with '?' is provided, it will return true if at least one element has at least one child matching the selector after the prefix, or false otherwise.
		If a string prefixed with '*' is provided, it will return true if all elements have at least one child matching the selector after the prefix.
		If a string prefixed with '!' is provided, it will return true if all elements have all children matching the selector after the prefix.
		If anything else is provided, it will return children of all elements matching what's provided.
		If nothing is provided, it will return all children of all elements.
	*/
	p.children = function(sel) {
		var requireAll, requireDeep, firstChar;
		if (typeof sel == TYPEOF_STRING && ((requireAll = (requireDeep = (firstChar = sel[0]) == '!') || firstChar == '*') || firstChar == '?')) {
			sel = sel.slice(1);
			requireDeep = ap[requireDeep ? ai_every : ai_some];
			return this.get()[requireAll ? ai_every : ai_some](function(elem) {
				return requireDeep.call(elem.childNodes, function(c) {
					return c.matches(sel);
				});
			});
		}
		return zQ_fn_iterate(this, function(elem) {
			var child = elem.children;
			if (child) { // Non-element nodes don't have children
				return sel ? zQ_fn_filter(child, sel) : child;
			}
		});
	};

	/*
		Designed to create a copy of a <template>'s contents... don't know what else it can do.
		The first element in the zQuery elements must be a <template>. Only the first element's contents is retrieved.
	*/
	p.import = function(times, fn) {
		var content = this.get(0).content,
			cloned,
			i = 0,
			using_fn = typeof fn == TYPEOF_FUNCTION,
			clones = [];
		times = times == undefined ? 1 : times;
		for ( ; i < times; ++i) {
			cloned = zQ_fn_import_DF(content);
			if (using_fn) {
				fn(cloned, i);
			}
			zQ_fn_merge_arrays(clones, cloned);
		}
		return $(clones);
	};
	p.databind = function(data, notLive) {
		if (notLive) {
			return zQ_fn_iterate(this, function(elem) {
				if (elem instanceof EN) {
					var html = elem.outerHTML;
					html = html.replace(zQ_set_regexp_handlebars, function(_, propName) {
						return zQ_fn_escape_HTML(data[propName]);
					});
					return zQ_fn_parseHTML(html);
				}
				return elem;
			});
		} else {
			var TEMPLATE_TEXT_PROP_NAME = 'zqdbt',
				templateText,
				toIterate = this.get(),
				elemToCheck,
				assoc = {},
				initAssoc = function(code, node) {
					return code.replace(zQ_set_regexp_handlebars, function(_, propName) {
						if (!assoc[propName]) {
							assoc[propName] = [];
						}
						assoc[propName].push(node);
						return data[propName];
					});
				};

			while (elemToCheck = toIterate.shift()) {
				switch (elemToCheck.nodeType) {
					case 3:
						templateText = elemToCheck.textContent;
						elemToCheck[TEMPLATE_TEXT_PROP_NAME] = templateText;
						elemToCheck.textContent = initAssoc(templateText, elemToCheck);
						break;

					case 1:
						zQ_fn_iterate(elemToCheck.attributes, function(attrObj) {
							templateText = attrObj.value;
							attrObj[TEMPLATE_TEXT_PROP_NAME] = templateText;
							attrObj.value = initAssoc(templateText, attrObj);
						}, false);
						zQ_fn_merge_arrays(toIterate, elemToCheck.childNodes);
						break;
				}
			}

			return new Proxy(data, {
				set: function(target, property, value) {
					target[property] = value;

					var associations = assoc[property];
					if (associations) {
						zQ_fn_iterate(associations, function(attrOrTextnode) {
							attrOrTextnode[attrOrTextnode instanceof Attr ? 'value' : 'textContent'] = attrOrTextnode[TEMPLATE_TEXT_PROP_NAME]
								.replace(zQ_set_regexp_handlebars, function(_, propName) {
									return target[propName];
								});
						}, false);
					}

					return true;
				}
			});
		}
	};

	p.display = function(val) {
		/*
			-- null or "" removes display inline styling
			-- undefined, <not defined> or Boolean (false) sets it to 'none'
			-- Boolean (true) sets it to 'block'
			-- Anything else sets the style value to it
		*/
		if (val === true) {
			val = 'block';
		} else if (val === undefined || val === false) {
			val = 'none';
		}
		zQ_fn_iterate(this, function(elem) {
			elem.style.display = val;
		}, false);
		return this;
	};

	/*
		Argument options:
			-- an existing array: appends each element's inner HTML to the end of the array, returns the zQuery object
			-- Boolean (true): returns an array containing each element's inner HTML
			-- string: sets each element's inner HTML to the string
			-- <other>: returns the combined inner HTML of each element as a single string
	*/
	p.html = function(html) {
		var _ = typeof html,
			new_arr = html === true,
			arr = new_arr,
			return_HTML;

		if (_ == TYPEOF_STRING || _ == TYPEOF_NUMBER) {
			zQ_fn_iterate(this, function(elem) {
				elem.innerHTML = html;
			}, false);
			return this;
		}

		return_HTML = new_arr ? [] : (arr = isArr(html)) ? html : '';
		zQ_fn_iterate(this, function(elem) {
			var eH = elem.innerHTML;
			if (arr) {
				return_HTML.push(eH);
			} else {
				return_HTML += eH;
			}
		}, false);
		return !new_arr && arr ? this : return_HTML;
	};

	p.text = function(text) {
		if (text !== undefined) {
			zQ_fn_iterate(this, function(elem) {
				elem.textContent = text;
			}, false);
			return this;
		}

		text = '';
		zQ_fn_iterate(this, function(node) {
			text += node.textContent;
		}, false);
		return text;
	};

	// NOTE: Will not get the value of a <select> option if it is disabled
	// WARNING: Will not set the value of a <select> element
	p.val = function(newVal) {
		var tagName,
			values = [],
			options,
			selected;

		if (newVal === undefined) {
			newVal = this.get(0);
			if (!newVal) {
				return nil;
			}
			tagName = newVal.tagName;
			if (/^(INPUT|TEXTAREA|OPTION|BUTTON)$/.test(tagName)) {
				if (newVal.type == 'file') {
					return zQ_fn_clone_array(newVal.files);
				}
				return newVal.value;
			} else if (tagName == 'SELECT') {
				options = newVal.options;
				selected = newVal.selectedIndex;
				if (!newVal.multiple) {
					if (~selected && !options[selected].disabled) {
						return newVal.value;
					} else {
						return nil;
					}
				}
				zQ_fn_iterate(options, function(option) {
					if (option.selected && !option.disabled) {
						values.push(option.value);
					}
				}, false);
				return values;
			}
		}
		zQ_fn_iterate(this, function(elem) {
			if (elem.value !== undefined && elem.tagName != 'SELECT') {
				elem.value = newVal;
			}
		}, false);
		return this;
	};

	/*
		Accepts:
			string: returns the value of the first element's property called the string
			string with exclamation mark prefix: with the value of each element's property called the string, set it to the opposite if it is a boolean, an empty string if it is a string, or null if it is an object
			string, function: run the function for each element, passing in the current property value, index and element, and setting the property value to the returned value
			string, non-function: for each element, set the property's value to the non-function
	*/
	p.prop = function(prop, newProp) {
		var toggle = false,
			func = false;
		if (prop[0] == '!') {
			prop = prop.slice(1);
			toggle = true;
		} else {
			func = typeof newProp == TYPEOF_FUNCTION;
		}
		if (!toggle && newProp === undefined) {
			return this.get(0)[prop];
		}

		zQ_fn_iterate(this, function(elem, i) {
			if (toggle) {
				switch (typeof elem[prop]) {
					case TYPEOF_STRING:
						newProp = '';
						break;
					case TYPEOF_BOOLEAN:
						newProp = !elem[prop];
						break;
					case TYPEOF_OBJECT:
						newProp = nil;
						break;
				}
			}
			elem[prop] = func ? newProp(elem[prop], i, elem) : newProp;
		}, false);

		return this;
	};

	p.css = function(styles, newStyle, reset) {
		/*
			Accepts:

			switch (typeof styles) {
				case null:
					Remove inline styles.

				case string:
					switch (typeof newStyle) {
						case string:
						case number:
							If {reset} is Boolean(true), remove inline styles before setting
							Set style called {styles} to {newStyle}

						default:
							Return style called {styles} value
					}

				case object:
					switch (typeof newStyle) {
						case Boolean(true):
							Reset styling AND then apply object's styles

						case object:
							Apply object's styles
					}
			}

			TIP: Setting a specific style's value to null or "" (but NOT undefined) will remove it
		*/

		// If {styles} is null, reset inline styling
		if (styles === nil) {
			return this.attr('style', styles);
		}

		// If {styles} is a string, get the style called {styles} if {newStyle} is not a string or number, otherwise set the style called {styles} to {newStyle}
		if (typeof styles == TYPEOF_STRING) {
			if (typeof newStyle != TYPEOF_STRING && typeof newStyle != TYPEOF_NUMBER) {
				return this.get(0).style[styles];
			}
			var s = styles;
			(styles = {})[s] = newStyle;
			newStyle = reset === true;
		}
		// If {styles} is an object and {newStyle} is true, reset inline styling before applying
		if (newStyle === true) {
			this.attr('style', nil);
		}
		zQ_fn_iterate(this, function(elem) {
			zQ_fn_iterate_object(styles, function(style, style_value) {
				elem.style[style] = style_value;
			});
		}, false);
		return this;
	};

	/*
		switch (typeof classes) {
			// NOTE: Any classes with a dot at the beginning has its dot prefix removed, as it is assumed a class selector was provided (instead of literally wanting a class with a dot at the front)
			case string:
				// NOTE: The classes to use is from splitting the string by whitespace
				-- prefixed with '*':
					-- with {operation} not a boolean: check if all elements have all the classes
					-- <other>: remove the prefix and proceed as normal classes string (below)
				-- with {operation} === true: add all classes to every element
				-- with {operation} === false: remove all classes from every element
				-- <other>: check if at least one element has all the classes
			case array:
				-- with {operation} === true: add all classes to every element
				-- with {operation} === false: remove all classes from every element
				-- <other>: for each value in the array, toggle the class called the value on each element
		}
	*/
	p.classes = function(classes, operation) {
		var requireAll,
			noOperation = typeof operation != TYPEOF_BOOLEAN,
			mode = noOperation ? 'toggle' : operation ? 'add' : 'remove';
		if (typeof classes == TYPEOF_STRING) {
			if ((requireAll = classes[0] == '*')) {
				classes = classes.slice(1);
			}
			classes = classes.split(zQ_set_regexp_whitespace);
			if (noOperation) {
				return this.get()[requireAll ? ai_every : ai_some](function(elem) {
					return classes.every(function(className) {
						if (className[0] == '.') {
							className = className.slice(1);
						}
						return elem.classList.contains(className);
					});
				});
			}
		}

		zQ_fn_iterate(this, function(elem) {
			/* BUG: Compact code is buggy, do not use:
				classes.forEach(list[mode], list);
			*/
			classes.forEach(function(name) {
				if (name[0] == '.') {
					name = name.slice(1);
				}
				elem.classList[mode](name);
			});
		}, false);
		return this;
	};

	p.attr = function(attributes, newOrToggle) {
		/*
			Accepts:
				-- string prefixed with ? or * for (arg. 1) {attributes} [
					-- '?' prefix: returns true if at least one element has the attribute after the prefix
					-- '*' prefix: returns true if all elements have the attribute after the prefix
				]
				-- string for (arg. 1) {attributes} [
					-- string for (arg. 2) {newOrToggle}: sets the attribute called {attributes} to the value {newOrToggle} on all elements
					-- array for (arg. 2) {newOrToggle}: pushes all the attribute values for elements that have the attribute on the array
					-- boolean TRUE for (arg. 2) {newOrToggle}: toggles the attribute called {attributes} on all elements, setting it to "" if it doesn't exist and removing it if it does
					-- null for (arg. 2) {newOrToggle}: removes the attribute called {attributes} on all elements
					-- <other> for (arg. 2) {newOrToggle}: returns the value of the first element's attribute called {attributes}
				]
				-- array for (arg. 1) {attributes} [
					-- <any> for (arg. 2): for each value in the array, toggle the attribute called the value on the elements
				]
				-- object for (arg. 1) {attributes} [
					-- boolean TRUE for (arg. 2) {newOrToggle}: for each of the strings in the array or keys in the object, toggle the attribute called the string or key for each element
						// NOTE: arg. 2 not required for array -- passing an array for arg. 1 will always enable toggling mode
					-- <other> for (arg. 2) {newOrToggle}: for each property in the object, set each element's attribute called the property's key to the property's value, or remove each element's attribute called the property's key if the property's value is null or undefined
				]
		*/
		var requireAll,
			a,
			array_to_toggle,
			toggle;

		if (typeof attributes == TYPEOF_STRING) {
			if ((requireAll = attributes[0] == '*') || attributes[0] == '?') {
				attributes = attributes.slice(1);
				return this.get()[requireAll ? ai_every : ai_some](function(elem) {
					return elem.hasAttribute(attributes);
				});
			}
			if (isArr(newOrToggle)) {
				zQ_fn_iterate(this, function(elem) {
					if (elem.hasAttribute(attributes)) {
						newOrToggle.push(elem.getAttribute(attributes));
					}
				}, false);
				return this;
			}
			if (newOrToggle === undefined) { // Allow null and (Boolean) TRUE in {newOrToggle} to pass
				return this.get(0).getAttribute(attributes);
			}

			// Create single-value object -- value will be set to {newOrToggle} or will be toggled if {newOrToggle} === true
			a = attributes;
			(attributes = {})[a] = newOrToggle;
		} else if (isArr(attributes)) {
			array_to_toggle = true;
		}

		toggle = newOrToggle === true || array_to_toggle;

		// {attributes} should be an object or toggling array at this point
		zQ_fn_iterate(this, function(elem) {
			zQ_fn_iterate_object(attributes, function(attr, attr_value) {
				if (array_to_toggle) {
					// Don't toggle if attribute name is undefined or null
					if ((attr = attr_value) == undefined) {
						return;
					}
				}
				if (toggle) {
					if (elem.hasAttribute(attr)) {
						elem.removeAttribute(attr);
					} else {
						elem.setAttribute(attr, '');
					}
				} else {
					if (attr_value == undefined) {
						elem.removeAttribute(attr);
					} else {
						elem.setAttribute(attr, attr_value);
					}
				}
			});
		}, false);
		return this;
	};

	// WARNING: The names must be in this order, as otherwise it will break the methods setup (below)
	['prepend', 'append', 'before', 'after', 'prependTo', 'appendTo', 'insertBefore', 'insertAfter'].forEach(function(methodName, i) {
		p[methodName] = function(nodes) {
			return zQ_fn_appendPrepend(i % 4, /To|insert/.test(methodName), this, nodes);
		};
	});

	p.empty = function() {
		zQ_fn_iterate(this, function(elem) {
			var child;
			while (child = elem.lastChild) {
				elem.removeChild(child);
			}
		}, false);
		return this;
	};

	p.remove = function() {
		zQ_fn_iterate(this, function(elem) {
			// Don't try to delete if node has already been deleted or has no parent
			if (elem.parentNode) {
				elem.parentNode.removeChild(elem);
			}
		}, false);
	};

	// WARNING: DELEGATE HANDLERS CANNOT BE REMOVED SINGULARLY
	/* Compatibility:

			-- The 'focus' and 'blur' events will use capture mode as they don't support bubbling (and the relative 'focusin' and 'focusout' bubbling events aren't supported by Mozilla Firefox)

	*/
	p.on = function(eventTypes, delegateSelector, eventFunction) {
		var handler = typeof delegateSelector == TYPEOF_STRING ?
			// Set to custom anonymous function that checks if delegate selector matches
			function(e) {
				if (e.target.matches(delegateSelector)) {
					eventFunction.call(e.target, e);
				}
			} :
			// Set to provided handler
			delegateSelector;

		eventTypes = eventTypes.split(zQ_set_regexp_whitespace);
		zQ_fn_iterate(this, function(elem) {
			var listeners = elem[zQ_set_prop_eventListeners] = elem[zQ_set_prop_eventListeners] || [];

			eventTypes.forEach(function(eventType) {
				listeners.push([eventType, handler]);
				elem.addEventListener(eventType, handler, zQ_set_regexp_captureEvents.test(eventType));
			});
		}, false);
		return this;
	};

	// WARNING: CANNOT REMOVE DELEGATE HANDLERS BASED ON FUNCTIONS
	/*
		Removes a specific event listener assigned with the function provided,
		or ALL event listeners CACHED by zQuery with the type provided.
	*/
	p.off = function(eventTypes, eventFunction) {
		eventTypes = eventTypes.split(zQ_set_regexp_whitespace);
		zQ_fn_iterate(this, function(elem) {
			// Get any zQuery properties on this element
			var listeners = elem[zQ_set_prop_eventListeners];

			eventTypes.forEach(function(eventType) {
				var eventTypeRequiresCapture = zQ_set_regexp_captureEvents.test(eventType);

				// Remove all cached event listeners
				if (eventFunction === undefined) {
					if (listeners) {
						// Loop through events and remove any listeners with matching event type
						listeners.forEach(function(eventData, i) {
							if (eventData[0] == eventType) {
								// Detach the event handler from the element
								elem.removeEventListener(eventType, eventData[1], eventTypeRequiresCapture);

								// GC: Delete event handler data (type and handler function) from the data array
								delete listeners[i];
							}
						});
					}
				}

				// Remove event listener by function reference
				else {
					elem.removeEventListener(eventType, eventFunction, eventTypeRequiresCapture);
				}
			});
		}, false);
		return this;
	};

	// WARNING: Does not support delegation
	p.one = function(eventTypes, eventFunction) {
		eventTypes = eventTypes.split(zQ_set_regexp_whitespace);
		zQ_fn_iterate(this, function(elem) {
			// Prepare HTMLElement object's zQuery eventListener property
			var listeners = elem[zQ_set_prop_eventListeners] = elem[zQ_set_prop_eventListeners] || [];

			// Assign and cache event listeners to this HTMLElement
			eventTypes.forEach(function(eventType) {
				var eID = listeners.length,
					eventTypeRequiresCapture = zQ_set_regexp_captureEvents.test(eventType),
					listener = listeners[eID] = [eventType, function(e) {
						eventFunction.call(this, e);
						this.removeEventListener(eventType, listener[1], eventTypeRequiresCapture);
						delete listeners[eID];
					}];
				elem.addEventListener(eventType, listener[1], eventTypeRequiresCapture);
			});
		}, false);
		return this;
	};

	p.hasFocus = function() {
		return this.get()[ai_some](function(elem) {
			// Code based from jQuery 2
			return elem == d.activeElement && (!d.hasFocus || d.hasFocus()) && !!(elem.type || elem.href || elem.tabIndex >= 0);
		});
	};

	// Triggers built-in event dispatcher if available, or creates a new event called the provided name and dispatches it from each element
	p.trigger = function(eventTypes) {
		eventTypes = eventTypes.split(zQ_set_regexp_whitespace);
		zQ_fn_iterate(this, function(elem) {
			eventTypes.forEach(function(eventType) {
				if (typeof elem[eventType] == TYPEOF_FUNCTION) {
					elem[eventType]();
				} else {
					elem.dispatchEvent(new Event(eventType));
				}
			});
		}, false);
		return this;
	};

	/*
		PUBLIC methods
	*/

	/*
		Asynchronous JavaScript and XML
	*/
	$.ajax = function(ajaxSettings) {
		var xhr = new XMLHttpRequest(),
			beforeSend = ajaxSettings.beforeSend || gen_func,

			handler_error = ajaxSettings.error || gen_func,
			handler_success = ajaxSettings.success || gen_func,
			handler_complete = ajaxSettings.complete || gen_func,
			aborted,

			headers = ajaxSettings.headers || {},

			uploadHandlers = ajaxSettings.upload || {},
			downloadHandlers = ajaxSettings.download || {},

			dataToSend = ajaxSettings.data || nil,
			dataToSendIsFormData = dataToSend instanceof FormData,
			method = ajaxSettings.method || 'GET',
			URL = ajaxSettings.url,

			statusOK,
			xhrErrorObject;

		xhr.onreadystatechange = function() {
			/*
				So it's the spec to set readyState to 4 and fire this event on abort, and THEN set readyState to 0 (firing this event once more)...
			*/
			// 4 is Complete state
			if (!aborted && xhr.readyState == 4) {
				try {
					// If no error will be thrown, set the error object to the status (which is the HTTP response code)
					xhrErrorObject = xhr.status;
					statusOK = xhrErrorObject >= 200 && xhrErrorObject < 300 || xhrErrorObject == 304;
				} catch (e) {
					// Communication/network error
					xhrErrorObject = e;
					statusOK = false;
				}

				if (statusOK) {
					// 2XX or 304 code means OK
					handler_success(xhr.responseText);
				} else {
					// Send back the error object and HTTP code, assuming code !== 2XX or 304 means error
					// If error was not caught and instead is the status code, construct an error
					if (!(xhrErrorObject instanceof Error)) {
						xhrErrorObject = Error('Request failed with status: ' + xhrErrorObject);
					}
					handler_error(xhrErrorObject, xhr.status, xhr.statusText);
				}

				// Run complete handler on Complete state
				handler_complete();
			}
		};

		// Add download event handlers
		zQ_fn_iterate_object(downloadHandlers, function(eventType, eventHandler) {
			xhr.addEventListener(eventType, eventHandler);
		});

		// Add upload event handlers
		zQ_fn_iterate_object(uploadHandlers, function(eventType, eventHandler) {
			xhr.upload.addEventListener(eventType, eventHandler);
		});

		// NOTE: Null and FormData are objects, so check for those before verifying data is generic object
		/*
			WARNINGS:
				-- No content-type header sent if not serialised generic object
				-- Serialised object always appended to URL with '?' prefix if method is not POST
		*/
		if (dataToSend && !dataToSendIsFormData && typeof dataToSend == TYPEOF_OBJECT) {
			dataToSend = zQ_fn_serialise_object(dataToSend);

			// Do not set Content-Type header if FormData or plain text string
			if (method == 'POST') {
				headers['Content-Type'] = 'application/x-www-form-urlencoded';
			} else {
				URL += '?' + dataToSend;
				dataToSend = nil;
			}
		}

		xhr.open(method, URL, true);
		zQ_fn_iterate_object(headers, function(header, header_value) {
			xhr.setRequestHeader(header, header_value);
		});

		beforeSend(xhr);
		xhr.send(dataToSend);

		return {
			abort: function() {
				// WARNING: Set flag first
				aborted = true;
				xhr.abort();
			},
			/* DEPRECATED 2.0
			error: function(func) {
				handler_error = func || gen_func;
				return this;
			},
			success: function(func) {
				handler_success = func || gen_func;
				return this;
			},
			on: function(event, handler) {
				xhr.addEventListener(event, handler);
				return this;
			}
			*/
		};
	};

	/* DEPRECATED 2.0
	$.isArrayLike = is_probably_array_like;
	*/

	/*
		Iterate through a provided string, array, array-like object or object using a provided function. The function will be passed the arguments for an object:

			- The property's value
			- The property's name
			- The last non-<undefined> returned value from previous function calls (provided by third argument at beginning or <undefined> if not provided)
			- The total amount of properties

		For an array(-like object, which includes strings):
			- The element
			- The element's index
			- The last non-<undefined> returned value from previous function calls (provided by third argument at beginning or <undefined> if not provided)
			- The total amount of elements

		This function combines:
			- .forEach
			- .map
			- .reduce
			- .some
			- .every
		methods for arrays and introduces them to objects.
		Return $.each.stop, true or false to break during iteration. Function returns whatever was last returned at the end unless it was $.each.stop (so returning a boolean will return that boolean at the end, regardless of what the returned value was before).

		WARNING: Don't change {init_ret} to second arg if second arg is not function, as user may want {init_ret} to be a function.
		WARNING: Won't iterate over values of undefined (whether not defined, deleted or set to <undefined>) in array(-like object)s.
	*/
	$.each = function(obj_or_arr, func, init_ret) {
		if (typeof obj_or_arr == TYPEOF_STRING) {
			obj_or_arr = obj_or_arr.split('');
		}
		var is_arr = is_probably_array_like(obj_or_arr),
			keys = is_arr ? obj_or_arr : objKeys(obj_or_arr),
			keys_count = keys.length,
			index = 0,
			key_or_value,
			ret = init_ret,
			response;

		for ( ; index < keys_count; ++index) {
			key_or_value = keys[index];
			if (key_or_value !== undefined) {
				if (is_arr) {
					response = func(key_or_value, index, ret, keys_count);
				} else {
					response = func(obj_or_arr[key_or_value], key_or_value, ret, keys_count);
				}
				if (response == $.each.stop) {
					break;
				} else if (response === true || response === false) {
					ret = response;
					break;
				} else if (response !== undefined) {
					ret = response;
				}
			}
		};
		return ret;
	};
	$.each.stop = {};
	/*
		Deepness:
			0 or false or undefined: Shallow copy
			1: Deep copy (all array(-like object)s and generic objects at all depths will also be shallow-copied)

			// DEPRECATED 2.0
				2: Super copy:
					- All generic objects and array-like* objects will be super-copied (* array-like objects will be converted into an array)
					- Nodes will all be deep-copied at all levels, whether they are in an array(-like object) or children of a parent node
					- Documents will be replaced with a deep-copied clone of its <html> element
					- DocumentFragments will be replaced with a deep-copied generic array of their children
					- Functions will be cloned

		WARNING: MANY WARNINGS
		======================
			- It is unadvisable to use this to clone anything other than array(-like object)s and generic objects
				- It may just return the value without doing anything
				- Most object instances are just impractical to properly clone
			- Cloning array-like objects is unlikely to prevent mutation of elements due to above
			- Detections of array(-like objects) and generic objects are not definite, only "very likely"
			- What doesn't work well:
				1) Object classes/"special functions"/built-in objects (i.e. Math, Date, Number BUT NOT instances of these)
					- Likely to be simply converted into a generic object or bound function
				2) A generic object with a .length property that is neither enumerable nor configurable
					- Likely to be mistaken for an array-like object
	*/
	$.clone = function(to_clone, deepness) {
		var is_array = is_probably_array_like(to_clone),
			keys,
			ret,
			i = 0,
			length,
			_,
			replacement;

		/* DEPRECATED 2.0
		if (deepness == 2 && to_clone) {
			if ((_ = to_clone.content || to_clone) instanceof DF) {
				ret = zQ_fn_import_DF(_);
			} else if ((_ = to_clone.documentElement || to_clone) instanceof EN) {
				ret = _.cloneNode(true);
			} else if (typeof to_clone == TYPEOF_FUNCTION) {
				ret = to_clone.bind(undefined);
				objKeys(ret).forEach(function(prop) {
					ret[prop] = to_clone[prop];
				});
			}
		}
		*/

		if (is_array) {
			ret = zQ_fn_clone_array(to_clone);
			length = ret.length;
		} else if (to_clone && (_ = to_clone.constructor) && _.name == "Object") {
			ret = {};
			keys = objKeys(to_clone);
			keys.forEach(function(prop) {
				ret[prop] = to_clone[prop];
			});
			length = keys.length;
		} else {
			ret = to_clone;
		}

		// Can't use zQ_fn_iterate due to falseyness or .forEach/.map due to potential undefined
		if (length && deepness) {
			for ( ; i < length; ++i) {
				replacement = $.clone(is_array ? ret[i] : ret[keys[i]], deepness);
				if (is_array) {
					ret[i] = replacement;
				} else {
					ret[keys[i]] = replacement;
				}
			}
		}

		return ret;
	};
	$.escape = {
		HTML: zQ_fn_escape_HTML,
		RegExp: function(str) {
			return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		}
	};
	$.shuffle = function(array) {
		array = zQ_fn_clone_array(array);

		var m = array.length, t, i;

		while (m) {
			i = (Math.random() * m--) | 0;
			t = array[m];
			array[m] = array[i];
			array[i] = t;
		}

		return array;
	};

	/* DEPRECATED 2.0
	$.factory = function(template, variables_str, replacements_raw, escape_HTML) {
		var i = 0,
			code_final = '',
			code_run,
			replacement,
			replacements,
			arr,
			multirun,
			runs = 1,
			variables = variables_str.split(zQ_set_regexp_whitespace),
			mirrorargs = isArr(replacements_raw) && variables.length == replacements_raw.length,
			escape_HTML = escape_HTML === true;

		if (multirun =
			( arr = isArr(replacements_raw[0]) ) ||
			( variables.length == 1 && isArr(replacements_raw) && replacements_raw.length > 1 )
		) {
			runs = replacements_raw.length;
		}

		for ( ; i < runs; ++i) {
			code_run = template;
			replacements = multirun ? replacements_raw[i] : replacements_raw;
			variables.forEach(function(variable, j) {
				variable = new RegExp('\\$\\{' + variable + '\\}', 'g');
				replacement = (mirrorargs || arr) ? replacements[j] : replacements;
				if (escape_HTML) {
					replacement = zQ_fn_escape_HTML(replacement);
				}
				code_run = code_run.replace(variable, replacement);
			});
			code_final += code_run;
		}
		return code_final;
	};
	*/

	// Setup complete, return pseudo-constructor alias
	if (typeof exports == TYPEOF_OBJECT) {
		module.exports = $;
	} else {
		w.$ = $;
	}
})();
