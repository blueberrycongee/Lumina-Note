//! 工具定义
//! 
//! 所有可用工具的 JSON Schema 定义

use serde_json::{json, Value};

/// 获取所有工具定义
pub fn get_all_tool_definitions() -> Vec<Value> {
    vec![
        update_plan_definition(),
        read_note_definition(),
        read_outline_definition(),
        read_section_definition(),
        edit_note_definition(),
        create_note_definition(),
        list_notes_definition(),
        search_notes_definition(),
        grep_search_definition(),
        semantic_search_definition(),
        move_note_definition(),
        delete_note_definition(),
        query_database_definition(),
        add_database_row_definition(),
        get_backlinks_definition(),
        ask_user_definition(),
        attempt_completion_definition(),
    ]
}

/// 根据 Agent 类型获取工具
pub fn get_tools_for_agent(agent: &str) -> Vec<Value> {
    match agent {
        "editor" => vec![
            update_plan_definition(),
            read_note_definition(),
            read_outline_definition(),
            read_section_definition(),
            edit_note_definition(),
            create_note_definition(),
            list_notes_definition(),
            search_notes_definition(),
            ask_user_definition(),
            attempt_completion_definition(),
        ],
        "researcher" => vec![
            update_plan_definition(),
            read_note_definition(),
            read_outline_definition(),
            read_section_definition(),
            list_notes_definition(),
            fast_search_definition(),  // 快速并行搜索 - 首选
            search_notes_definition(),
            grep_search_definition(),
            semantic_search_definition(),
            get_backlinks_definition(),
            ask_user_definition(),
            attempt_completion_definition(),
        ],
        "writer" => vec![
            update_plan_definition(),
            read_note_definition(),
            create_note_definition(),
            edit_note_definition(),
            list_notes_definition(),
            ask_user_definition(),
            attempt_completion_definition(),
        ],
        "organizer" => vec![
            update_plan_definition(),
            read_note_definition(),
            list_notes_definition(),
            move_note_definition(),
            delete_note_definition(),
            create_note_definition(),
            query_database_definition(),
            add_database_row_definition(),
            ask_user_definition(),
            attempt_completion_definition(),
        ],
        _ => get_all_tool_definitions(),
    }
}

fn read_note_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "read_note",
            "description": "读取笔记文件的内容。返回带行号的内容（1-indexed），便于后续编辑定位。对于大文件（>500行），可使用 offset/limit 分段读取，或优先使用 read_outline + read_section。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "笔记路径，相对于笔记库根目录"
                    },
                    "offset": {
                        "type": "integer",
                        "description": "起始行号（1-indexed）。仅对大文件使用，小文件不需要此参数"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "读取的行数。仅对大文件使用，小文件不需要此参数"
                    }
                },
                "required": ["path"]
            }
        }
    })
}

fn read_outline_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "read_outline",
            "description": "快速读取笔记的大纲结构（标题层级）。适合快速了解笔记内容分布，定位相关章节。支持批量读取多个笔记。比 read_note 更轻量，优先使用此工具进行初步探索。",
            "parameters": {
                "type": "object",
                "properties": {
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "笔记路径列表，相对于笔记库根目录。可以一次读取多个笔记的大纲。"
                    }
                },
                "required": ["paths"]
            }
        }
    })
}

fn read_section_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "read_section",
            "description": "读取笔记的指定章节内容。通过标题名定位章节，只返回该章节的内容（包含子章节）。适合在 read_outline 定位后深入阅读。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "笔记路径，相对于笔记库根目录"
                    },
                    "section": {
                        "type": "string",
                        "description": "章节标题名（不含 # 号）。如 '借用规则' 或 '第二章'"
                    }
                },
                "required": ["path", "section"]
            }
        }
    })
}

fn edit_note_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "edit_note",
            "description": "编辑已存在的笔记。使用精确的字符串替换，old_string 必须与文件内容完全匹配。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "笔记路径，相对于笔记库根目录"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "要替换的原文本，必须与文件内容完全匹配"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "替换后的新文本"
                    }
                },
                "required": ["path", "old_string", "new_string"]
            }
        }
    })
}

fn create_note_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "create_note",
            "description": "创建新笔记。如果文件已存在会失败。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "新笔记路径，相对于笔记库根目录，应以 .md 结尾"
                    },
                    "content": {
                        "type": "string",
                        "description": "笔记内容"
                    }
                },
                "required": ["path", "content"]
            }
        }
    })
}

fn list_notes_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "list_notes",
            "description": "列出指定目录下的所有文件和子目录。可以递归列出所有子目录内容。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "目录路径，相对于笔记库根目录。留空或 '.' 表示根目录"
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "是否递归列出所有子目录的内容，默认 false"
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "递归时的最大深度，默认 3"
                    }
                },
                "required": []
            }
        }
    })
}

fn search_notes_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "在笔记库中搜索包含指定关键词的笔记。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最大返回结果数，默认 10"
                    }
                },
                "required": ["query"]
            }
        }
    })
}

fn move_note_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "move_note",
            "description": "移动或重命名笔记文件。",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_path": {
                        "type": "string",
                        "description": "原路径，相对于笔记库根目录"
                    },
                    "to_path": {
                        "type": "string",
                        "description": "目标路径，相对于笔记库根目录"
                    }
                },
                "required": ["from_path", "to_path"]
            }
        }
    })
}

fn delete_note_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "delete_note",
            "description": "删除笔记文件（移动到回收站）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要删除的笔记路径，相对于笔记库根目录"
                    }
                },
                "required": ["path"]
            }
        }
    })
}

fn ask_user_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "ask_user",
            "description": "向用户提问，获取额外信息或确认。",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "要问用户的问题"
                    }
                },
                "required": ["question"]
            }
        }
    })
}

fn attempt_completion_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "attempt_completion",
            "description": "任务完成时调用，向用户报告结果。",
            "parameters": {
                "type": "object",
                "properties": {
                    "result": {
                        "type": "string",
                        "description": "任务完成的结果描述"
                    }
                },
                "required": ["result"]
            }
        }
    })
}

fn grep_search_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "grep_search",
            "description": "在笔记库中使用正则表达式或关键词搜索内容。比 search_notes 更精确，可以使用正则表达式。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "搜索模式（支持正则表达式）"
                    },
                    "path": {
                        "type": "string",
                        "description": "搜索路径，相对于笔记库根目录。留空搜索整个笔记库"
                    },
                    "case_sensitive": {
                        "type": "boolean",
                        "description": "是否区分大小写，默认 false"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最大返回结果数，默认 20"
                    }
                },
                "required": ["pattern"]
            }
        }
    })
}

fn fast_search_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "fast_search",
            "description": "快速并行搜索工具。同时搜索多个关键词，按命中数排序返回结果。比 grep_search 更快（并行处理）且支持多关键词。",
            "parameters": {
                "type": "object",
                "properties": {
                    "keywords": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "要搜索的关键词列表，如 [\"二重积分\", \"错题\", \"极坐标\"]。文件命中的关键词越多排名越靠前。"
                    }
                },
                "required": ["keywords"]
            }
        }
    })
}

fn semantic_search_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "semantic_search",
            "description": "使用语义搜索在笔记库中查找相关内容。基于向量相似度，能理解语义含义而非仅匹配关键词。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询（自然语言描述）"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最大返回结果数，默认 5"
                    }
                },
                "required": ["query"]
            }
        }
    })
}

fn query_database_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "query_database",
            "description": "查询数据库表格的内容。可以获取所有行或按条件筛选。",
            "parameters": {
                "type": "object",
                "properties": {
                    "database_id": {
                        "type": "string",
                        "description": "数据库 ID（.db.json 文件名，不含扩展名）"
                    },
                    "filter": {
                        "type": "object",
                        "description": "筛选条件，键为列名，值为匹配值"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最大返回行数，默认 50"
                    }
                },
                "required": ["database_id"]
            }
        }
    })
}

fn add_database_row_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "add_database_row",
            "description": "向数据库添加新行。会创建对应的笔记文件并设置 frontmatter。",
            "parameters": {
                "type": "object",
                "properties": {
                    "database_id": {
                        "type": "string",
                        "description": "数据库 ID（.db.json 文件名，不含扩展名）"
                    },
                    "title": {
                        "type": "string",
                        "description": "新行的标题（也是笔记文件名）"
                    },
                    "cells": {
                        "type": "object",
                        "description": "列值，键为列名，值为单元格内容"
                    }
                },
                "required": ["database_id", "title"]
            }
        }
    })
}

fn get_backlinks_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "get_backlinks",
            "description": "获取链接到指定笔记的所有反向链接（哪些笔记引用了这个笔记）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "笔记路径，相对于笔记库根目录"
                    }
                },
                "required": ["path"]
            }
        }
    })
}

/// Windsurf 风格的 update_plan 工具定义
/// 单一工具管理任务计划，支持创建和更新
fn update_plan_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "update_plan",
            "description": "管理任务计划。用于创建新计划或更新现有计划的步骤状态。每次调用传入完整的计划列表。同一时间只能有一个步骤处于 in_progress 状态。",
            "parameters": {
                "type": "object",
                "properties": {
                    "explanation": {
                        "type": "string",
                        "description": "可选的计划说明，解释为什么创建或更新计划"
                    },
                    "plan": {
                        "type": "array",
                        "description": "计划步骤列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "step": {
                                    "type": "string",
                                    "description": "步骤描述"
                                },
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "in_progress", "completed"],
                                    "description": "步骤状态：pending=待执行, in_progress=执行中, completed=已完成"
                                }
                            },
                            "required": ["step", "status"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["plan"]
            }
        }
    })
}
