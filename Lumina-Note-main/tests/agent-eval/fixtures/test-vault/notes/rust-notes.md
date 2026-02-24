# Rust 学习笔记

## 所有权系统

Rust 的核心特性，编译时内存安全保证。

### 规则

1. 每个值有且只有一个所有者
2. 所有者离开作用域时，值被释放
3. 值可以被借用，但有限制

### 借用

```rust
fn main() {
    let s = String::from("hello");
    
    // 不可变借用
    let len = calculate_length(&s);
    
    // 可变借用
    let mut s2 = String::from("hello");
    change(&mut s2);
}

fn calculate_length(s: &String) -> usize {
    s.len()
}

fn change(s: &mut String) {
    s.push_str(", world");
}
```

## 异步编程

### async/await

```rust
async fn fetch_data() -> Result<String, Error> {
    let response = reqwest::get("https://api.example.com").await?;
    let text = response.text().await?;
    Ok(text)
}
```

### Tokio 运行时

```rust
#[tokio::main]
async fn main() {
    let result = fetch_data().await;
    println!("{:?}", result);
}
```

## TODO

- [ ] TODO: 学习生命周期
- [ ] TODO: 学习宏编程
- [ ] TODO: 学习 unsafe

## 链接

- [[react-notes]]
- [[../projects/lumina-note]]
