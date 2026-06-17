/// Registry `{var}` → runtime `${var}` (already-`${` forms are left as-is).
pub fn registry_braces_to_env_template(text: &str) -> String {
    let mut result = String::with_capacity(text.len() + 8);
    let chars: Vec<char> = text.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '$' {
            result.push('$');
            index += 1;
            if index < chars.len() && chars[index] == '{' {
                while index < chars.len() {
                    result.push(chars[index]);
                    if chars[index] == '}' {
                        index += 1;
                        break;
                    }
                    index += 1;
                }
            }
            continue;
        }
        if chars[index] == '{' {
            let start = index + 1;
            let mut end = start;
            while end < chars.len() {
                let ch = chars[end];
                if ch == '}' {
                    break;
                }
                if !(ch.is_ascii_alphanumeric() || ch == '_') {
                    end = start;
                    break;
                }
                end += 1;
            }
            if end > start && end < chars.len() && chars[end] == '}' {
                result.push_str("${");
                for ch in &chars[start..end] {
                    result.push(*ch);
                }
                result.push('}');
                index = end + 1;
                continue;
            }
        }
        result.push(chars[index]);
        index += 1;
    }
    result
}

pub fn canonical_header_id(name: &str) -> String {
    format!("header:{}", name.trim())
}

/// `header:Authorization` or legacy `header:0:Authorization` → `Authorization`.
pub fn header_name_from_config_key(key: &str) -> Option<String> {
    let rest = key.strip_prefix("header:")?;
    if let Some((prefix, name)) = rest.split_once(':') {
        if prefix.chars().all(|ch| ch.is_ascii_digit()) && !name.trim().is_empty() {
            return Some(name.trim().to_string());
        }
    }
    let trimmed = rest.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn normalize_header_row_name(name: &str) -> String {
    header_name_from_config_key(name).unwrap_or_else(|| name.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_braces_become_env_template() {
        assert_eq!(
            registry_braces_to_env_template("Bearer {smithery_api_key}"),
            "Bearer ${smithery_api_key}"
        );
        assert_eq!(
            registry_braces_to_env_template("already ${ok}"),
            "already ${ok}"
        );
    }

    #[test]
    fn legacy_header_keys_normalize() {
        assert_eq!(
            header_name_from_config_key("header:0:Authorization").as_deref(),
            Some("Authorization")
        );
        assert_eq!(
            header_name_from_config_key("header:Authorization").as_deref(),
            Some("Authorization")
        );
    }
}
