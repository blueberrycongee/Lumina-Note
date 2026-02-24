/**
 * 液态玻璃雾气效果
 * 模拟玻璃上凝结的小水珠/雾气
 * 当水珠积累到一定程度时，猫爪会来刮干净！
 */

import { useEffect, useRef } from "react";

// 雾气粒子状态
enum ParticleState {
  Appear = 0,  // 出现（变大变亮）
  Stay = 1,    // 停留
  Disappear = 2 // 消失（变小变淡）
}

interface MistParticle {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  maxAlpha: number;
  state: ParticleState;
  timer: number;
  stayDuration: number;
  lifeSpeed: number;
}

// 猫爪雨刮器状态（从上往下刮）
interface WiperState {
  active: boolean;
  progress: number;     // 0-1 动画进度
  phase: number;        // 动画阶段: 0=准备, 1=刮, 2=结束
  lastWipeTime: number; // 上次刮完的时间（用于 CD）
}

interface LiquidGlassEffectProps {
  className?: string;
}

export function LiquidGlassEffect({ className }: LiquidGlassEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<MistParticle[]>([]);
  const wiperRef = useRef<WiperState>({
    active: false,
    progress: 0,
    phase: 0,
    lastWipeTime: 0,
  });
  
  // 冷却时间 6 秒（刮完后需要时间重新积累）
  const WIPER_COOLDOWN = 6000;
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true })!;
    let width = 0;
    let height = 0;

    // 设置画布大小
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        width = rect.width;
        height = rect.height;
        canvas.width = width;
        canvas.height = height;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // 创建雾气粒子
    const createParticle = (firstTime = false): MistParticle => {
      const rand = Math.random();
      let maxRadius: number;
      let lifeSpeed: number;

      if (rand < 0.8) {
        // 微小雾气 (80%) - 0.5px ~ 1.7px
        maxRadius = Math.random() * 1.2 + 0.5;
        lifeSpeed = Math.random() * 0.006 + 0.003; // 加快出现速度
      } else {
        // 可见水珠 (20%) - 1.5px ~ 3.5px
        maxRadius = Math.random() * 2.0 + 1.5;
        lifeSpeed = Math.random() * 0.01 + 0.006; // 加快出现速度
      }

      const particle: MistParticle = {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0,
        maxRadius,
        alpha: 0,
        maxAlpha: Math.random() * 0.4 + 0.3,
        state: ParticleState.Appear,
        timer: 0,
        stayDuration: Math.random() * 800 + 500, // 停留更久
        lifeSpeed,
      };

      if (firstTime) {
        particle.state = Math.floor(Math.random() * 3) as ParticleState;
        if (particle.state === ParticleState.Stay) {
          particle.radius = particle.maxRadius;
          particle.alpha = particle.maxAlpha;
        }
      }

      return particle;
    };

    // 初始化粒子
    particlesRef.current = Array.from({ length: 350 }, () => createParticle(true));

    // 更新粒子状态
    const updateParticle = (p: MistParticle) => {
      switch (p.state) {
        case ParticleState.Appear:
          p.alpha += p.lifeSpeed * 3;
          p.radius += p.lifeSpeed * 8;
          if (p.alpha >= p.maxAlpha || p.radius >= p.maxRadius) {
            p.alpha = p.maxAlpha;
            p.radius = p.maxRadius;
            p.state = ParticleState.Stay;
            p.timer = 0;
          }
          break;

        case ParticleState.Stay:
          p.timer++;
          if (p.timer > p.stayDuration) {
            p.state = ParticleState.Disappear;
          }
          break;

        case ParticleState.Disappear:
          p.alpha -= p.lifeSpeed * 0.3;
          p.radius -= p.lifeSpeed * 0.5;
          if (p.alpha <= 0 || p.radius <= 0) {
            Object.assign(p, createParticle(false));
          }
          break;
      }
    };

    // 绘制粒子
    const drawParticle = (p: MistParticle) => {
      if (p.alpha <= 0.01 || p.radius <= 0) return;

      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.maxRadius < 1.0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fill();
        ctx.restore();
        return;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

      const gradient = ctx.createRadialGradient(
        p.x - p.radius * 0.3, p.y - p.radius * 0.3, 0,
        p.x, p.y, p.radius
      );
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      gradient.addColorStop(0.3, "rgba(220, 235, 255, 0.6)");
      gradient.addColorStop(0.7, "rgba(200, 220, 245, 0.3)");
      gradient.addColorStop(1, "rgba(180, 200, 230, 0.1)");
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      const edgeGradient = ctx.createRadialGradient(
        p.x, p.y, p.radius * 0.5,
        p.x, p.y, p.radius
      );
      edgeGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
      edgeGradient.addColorStop(1, "rgba(0, 0, 0, 0.15)");
      ctx.fillStyle = edgeGradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();

      ctx.restore();
    };

    // 绘制橘猫爪 + 竖向雨刮板（从右往左刮）🐾
    const drawCatWiper = (x: number) => {
      ctx.save();
      
      // 阴影效果
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = -10;
      
      // === 雨刮板（竖向，覆盖整个高度）===
      const wiperWidth = 15;
      
      // 刮条主体
      ctx.beginPath();
      ctx.roundRect(x, 0, wiperWidth, height, 5);
      ctx.fillStyle = "#333";
      ctx.fill();
      
      // 橡胶边缘（左侧）
      ctx.shadowColor = "transparent";
      ctx.beginPath();
      ctx.rect(x, 0, 5, height);
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();
      
      // === 橘猫爪（在刮板右侧，爪子抓住刮板）===
      ctx.save();
      ctx.translate(x + wiperWidth + 180, height / 2);
      ctx.rotate(Math.PI / 2); // 顺时针旋转90度，让爪子朝左抓住刮板
      
      // 橘猫色
      const furColor = "#EBA937";
      const padColor = "#FFFFFF";
      
      // 手臂 - 梯形
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(60, 0);
      ctx.lineTo(70, 140);
      ctx.lineTo(10, 140);
      ctx.closePath();
      ctx.fillStyle = furColor;
      ctx.fill();
      
      // 爪子主体
      ctx.beginPath();
      ctx.arc(40, 150, 35, 0, Math.PI * 2);
      ctx.fillStyle = furColor;
      ctx.fill();
      
      // 大肉垫
      ctx.beginPath();
      ctx.arc(40, 155, 20, 0, Math.PI * 2);
      ctx.fillStyle = padColor;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      
      // 小肉垫（4个脚趾）
      const toePads = [
        { cx: 15, cy: 135, r: 8 },
        { cx: 35, cy: 125, r: 8 },
        { cx: 60, cy: 130, r: 8 },
        { cx: 70, cy: 150, r: 8 },
      ];
      
      for (const pad of toePads) {
        ctx.beginPath();
        ctx.arc(pad.cx, pad.cy, pad.r, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.restore();
    };

    // S 型贝塞尔缓动曲线：慢 → 快 → 慢（经典 easeInOutCubic）
    const customEase = (t: number): number => {
      // 三次贝塞尔 S 曲线
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    // 检查是否需要触发猫爪
    const checkTriggerWiper = () => {
      const wiper = wiperRef.current;
      if (wiper.active) return;
      
      // 检查冷却时间（5.5 秒 CD）
      const now = performance.now();
      if (now - wiper.lastWipeTime < WIPER_COOLDOWN) return;

      // 统计可见粒子数量
      const visibleCount = particlesRef.current.filter(
        p => p.state === ParticleState.Stay && p.alpha > 0.2
      ).length;

      // 当可见粒子超过 280 个时触发
      if (visibleCount > 280) {
        wiper.active = true;
        wiper.progress = 0;
        wiper.phase = 1;
      }
    };

    // 更新猫爪雨刮器（从右往左，贝塞尔曲线速度）
    const updateWiper = () => {
      const wiper = wiperRef.current;
      if (!wiper.active) return;

      // 增加进度（整个动画约 6 秒）
      wiper.progress += 0.003;
      
      // 应用缓动函数计算实际 X 位置（从右往左）
      const easedProgress = customEase(Math.min(wiper.progress, 1));
      const startX = width + 200;  // 从右边屏幕外开始
      const endX = -200;           // 到左边屏幕外结束
      const currentX = startX + (endX - startX) * easedProgress;
      
      // 清除雨刮器经过区域的粒子
      const wiperLeft = currentX - 50;
      const wiperRight = currentX + 80;
      
      for (const p of particlesRef.current) {
        if (p.x > wiperLeft && p.x < wiperRight) {
          p.alpha = 0;
          p.radius = 0;
          p.state = ParticleState.Disappear;
        }
      }
      
      // 动画完成
      if (wiper.progress >= 1) {
        wiper.active = false;
        wiper.progress = 0;
        wiper.lastWipeTime = performance.now(); // 记录完成时间，开始 CD
      }
    };
    
    // 获取当前 X 位置（供绘制使用）
    const getWiperX = (): number => {
      const wiper = wiperRef.current;
      const easedProgress = customEase(Math.min(wiper.progress, 1));
      const startX = width + 200;
      const endX = -200;
      return startX + (endX - startX) * easedProgress;
    };

    // 动画循环
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // 更新和绘制粒子
      for (const particle of particlesRef.current) {
        updateParticle(particle);
        drawParticle(particle);
      }

      // 检查是否触发猫爪
      checkTriggerWiper();

      // 更新和绘制猫爪雨刮器
      const wiper = wiperRef.current;
      if (wiper.active) {
        updateWiper();
        drawCatWiper(getWiperX());
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
