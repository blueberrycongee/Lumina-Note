//! Constants for LangGraph
//!
//! Defines special node markers and other constants.

/// The first (virtual) node in the graph - entry point marker
pub const START: &str = "__start__";

/// The last (virtual) node in the graph - exit point marker  
pub const END: &str = "__end__";

/// Separator for namespaced node names
pub const NS_SEP: &str = ":";

/// End marker for namespaces
pub const NS_END: &str = "::";

/// Maximum iterations before stopping (safety limit)
pub const MAX_ITERATIONS: usize = 100;

/// Check if a node name is reserved
pub fn is_reserved_name(name: &str) -> bool {
    name == START || name == END
}

/// Check if a node name contains reserved characters
pub fn has_reserved_chars(name: &str) -> bool {
    name.contains(NS_SEP) || name.contains(NS_END)
}
