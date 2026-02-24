# React 学习笔记

## Hooks

### useState

```jsx
const [count, setCount] = useState(0);
```

### useEffect

```jsx
useEffect(() => {
  // 副作用
  return () => {
    // 清理
  };
}, [deps]);
```

### useCallback

用于缓存函数引用。

## 最佳实践

1. 组件拆分要合理
2. 状态提升
3. 使用 Context 避免 prop drilling

## TODO

- [ ] TODO: 学习 Server Components
- [ ] TODO: 学习 Suspense
