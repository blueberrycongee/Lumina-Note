use forge::runtime::error::{GraphError, GraphResult, Interrupt};
use forge::runtime::event::PermissionReply;
use forge::runtime::permission::{PermissionDecision, PermissionRequest};
use forge::runtime::tool::ToolContext;
use regex::Regex;
use serde_json::Map;
use std::sync::Mutex;

#[derive(Clone, Debug)]
pub struct PermissionRule {
    pub permission: String,
    pub pattern: String,
    pub action: PermissionDecision,
}

impl PermissionRule {
    pub fn new(
        permission: impl Into<String>,
        pattern: impl Into<String>,
        action: PermissionDecision,
    ) -> Self {
        Self {
            permission: permission.into(),
            pattern: pattern.into(),
            action,
        }
    }
}

pub type PermissionRuleset = Vec<PermissionRule>;

pub fn default_ruleset() -> PermissionRuleset {
    vec![
        PermissionRule::new("*", "*", PermissionDecision::Allow),
        PermissionRule::new("doom_loop", "*", PermissionDecision::Ask),
        PermissionRule::new("external_directory", "*", PermissionDecision::Ask),
        PermissionRule::new("read", "*", PermissionDecision::Allow),
        PermissionRule::new("read", "*.env", PermissionDecision::Ask),
        PermissionRule::new("read", "*.env.*", PermissionDecision::Ask),
        PermissionRule::new("read", "*.env.example", PermissionDecision::Allow),
    ]
}

#[derive(Default)]
struct PermissionOverrides {
    once: Vec<PermissionRule>,
    always: Vec<PermissionRule>,
    reject: Vec<PermissionRule>,
}

impl PermissionOverrides {
    fn decide(&mut self, permission: &str, pattern: &str) -> Option<PermissionDecision> {
        if let Some(index) = find_last_match_index(&self.reject, permission, pattern) {
            return Some(self.reject[index].action);
        }
        if let Some(index) = find_last_match_index(&self.always, permission, pattern) {
            return Some(self.always[index].action);
        }
        if let Some(index) = find_last_match_index(&self.once, permission, pattern) {
            let action = self.once[index].action;
            self.once.remove(index);
            return Some(action);
        }
        None
    }

    fn apply_reply(&mut self, permission: &str, pattern: &str, reply: PermissionReply) {
        match reply {
            PermissionReply::Once => self
                .once
                .push(PermissionRule::new(permission, pattern, PermissionDecision::Allow)),
            PermissionReply::Always => self
                .always
                .push(PermissionRule::new(permission, pattern, PermissionDecision::Allow)),
            PermissionReply::Reject => self
                .reject
                .push(PermissionRule::new(permission, pattern, PermissionDecision::Deny)),
        }
    }
}

pub struct PermissionSession {
    base: PermissionRuleset,
    overrides: Mutex<PermissionOverrides>,
}

impl PermissionSession {
    pub fn new(base: PermissionRuleset) -> Self {
        Self {
            base,
            overrides: Mutex::new(PermissionOverrides::default()),
        }
    }

    pub fn decide(&self, permission: &str, pattern: &str) -> PermissionDecision {
        if let Ok(mut overrides) = self.overrides.lock() {
            if let Some(decision) = overrides.decide(permission, pattern) {
                return decision;
            }
        }
        find_last_match(&self.base, permission, pattern)
            .map(|rule| rule.action)
            .unwrap_or(PermissionDecision::Allow)
    }

    pub fn apply_reply(&self, permission: &str, pattern: &str, reply: PermissionReply) {
        if let Ok(mut overrides) = self.overrides.lock() {
            overrides.apply_reply(permission, pattern, reply);
        }
    }
}

pub fn request_permission(
    ctx: &ToolContext,
    session: &PermissionSession,
    permission: &str,
    pattern: &str,
    metadata: Map<String, serde_json::Value>,
    always: Vec<String>,
) -> GraphResult<()> {
    match session.decide(permission, pattern) {
        PermissionDecision::Allow => Ok(()),
        PermissionDecision::Deny => Err(GraphError::PermissionDenied {
            permission: format!("{} {}", permission, pattern),
            message: "permission denied".to_string(),
        }),
        PermissionDecision::Ask => {
            let request = PermissionRequest::new(permission.to_string(), vec![pattern.to_string()])
                .with_metadata(metadata)
                .with_always(always);
            ctx.emit(request.to_event());
            Err(GraphError::Interrupted(vec![Interrupt::new(
                request,
                format!("permission:{}", permission),
            )]))
        }
    }
}

fn find_last_match<'a>(
    rules: &'a [PermissionRule],
    permission: &str,
    pattern: &str,
) -> Option<&'a PermissionRule> {
    let mut found = None;
    for rule in rules {
        if rule_matches(rule, permission, pattern) {
            found = Some(rule);
        }
    }
    found
}

fn find_last_match_index(
    rules: &[PermissionRule],
    permission: &str,
    pattern: &str,
) -> Option<usize> {
    let mut found = None;
    for (index, rule) in rules.iter().enumerate() {
        if rule_matches(rule, permission, pattern) {
            found = Some(index);
        }
    }
    found
}

fn rule_matches(rule: &PermissionRule, permission: &str, pattern: &str) -> bool {
    wildcard_match(permission, &rule.permission) && wildcard_match(pattern, &rule.pattern)
}

fn wildcard_match(value: &str, pattern: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    let mut escaped = regex::escape(pattern);
    escaped = escaped.replace("\\*", ".*");
    escaped = escaped.replace("\\?", ".");

    if escaped.ends_with(" .*") {
        let trimmed = escaped.trim_end_matches(" .*");
        escaped = format!("{}( .*)?", trimmed);
    }

    let regex = Regex::new(&format!("(?s)^{}$", escaped));
    match regex {
        Ok(re) => re.is_match(value),
        Err(_) => false,
    }
}
