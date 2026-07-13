(() => {
  const DEG = Math.PI / 180;

  const els = {
    phi: document.getElementById("phi"),
    c: document.getElementById("c"),
    s3: document.getElementById("s3"),
    s1: document.getElementById("s1"),
    theta: document.getElementById("theta"),
    phiOut: document.getElementById("phiOut"),
    cOut: document.getElementById("cOut"),
    s3Out: document.getElementById("s3Out"),
    s1Out: document.getElementById("s1Out"),
    thetaOut: document.getElementById("thetaOut"),
    readout: document.getElementById("readout"),
    mohr: document.getElementById("mohr"),
    dune: document.getElementById("dune"),
  };

  const COLORS = {
    ink: "#1a1714",
    muted: "#6a6258",
    axis: "rgba(26,23,20,0.5)",
    grid: "rgba(26,23,20,0.07)",
    envelope: "#b54a2a",
    circleStable: "#2c4a5e",
    circleFill: "rgba(74,122,155,0.10)",
    circleFailFill: "rgba(181,74,42,0.10)",
    plane: "#8b6914",
    planeFill: "#c4a574",
  };

  // ---------- mechanics ----------

  function angleOfRepose(phiDeg, cKpa) {
    // Cohesionless sand: repose angle equals friction angle.
    // Cohesion lets a free face stand steeper; modest, saturating boost.
    const boost = Math.atan((cKpa / 25) * 0.55) / DEG;
    return Math.min(75, phiDeg + boost);
  }

  function stressesOnPlane(s1, s3, thetaDeg) {
    const t = 2 * thetaDeg * DEG;
    return {
      sn: (s1 + s3) / 2 + ((s1 - s3) / 2) * Math.cos(t),
      tau: ((s1 - s3) / 2) * Math.sin(t),
    };
  }

  function failureShear(sn, phiDeg, c) {
    return c + sn * Math.tan(phiDeg * DEG);
  }

  function envelopeState(s1, s3, phiDeg, c) {
    const center = (s1 + s3) / 2;
    const radius = (s1 - s3) / 2;
    const phi = phiDeg * DEG;
    // Perpendicular distance from (center, 0) to τ = c + σ tanφ
    const d = (center * Math.sin(phi) + c * Math.cos(phi));
    return {
      distance: d,
      radius,
      touching: Math.abs(d - radius) < Math.max(1.5, 0.015 * radius),
      failed: radius > d + 0.5,
    };
  }

  const criticalPlaneAngle = (phiDeg) => 45 + phiDeg / 2;

  // ---------- state ----------

  function read() {
    const min = Number(els.s3.value) + 5;
    els.s1.min = String(min);
    if (Number(els.s1.value) < min) els.s1.value = String(min);
    return {
      phi: Number(els.phi.value),
      c: Number(els.c.value),
      s3: Number(els.s3.value),
      s1: Number(els.s1.value),
      theta: Number(els.theta.value),
    };
  }

  function updateLabels(p) {
    els.phiOut.textContent = `${p.phi.toFixed(1)}\u00B0`;
    els.cOut.textContent = `${p.c.toFixed(1)} kPa`;
    els.s3Out.textContent = `${p.s3.toFixed(0)} kPa`;
    els.s1Out.textContent = `${p.s1.toFixed(0)} kPa`;
    els.thetaOut.textContent = `${p.theta.toFixed(1)}\u00B0`;
  }

  function updateReadout(p) {
    const { sn, tau } = stressesOnPlane(p.s1, p.s3, p.theta);
    const tauF = failureShear(sn, p.phi, p.c);
    const alpha = angleOfRepose(p.phi, p.c);
    const thetaF = criticalPlaneAngle(p.phi);
    const state = envelopeState(p.s1, p.s3, p.phi, p.c);
    const planeSafe = Math.abs(tau) <= tauF + 0.05;

    let statusClass = "ok";
    let statusText = "Stable stress state";
    if (state.failed) {
      statusClass = "fail";
      statusText = "Failure \u2014 circle crosses envelope";
    } else if (state.touching) {
      statusClass = "fail";
      statusText = "At failure \u2014 circle tangent to envelope";
    }

    const row = (label, value) =>
      `<div class="row"><span>${label}</span><strong>${value}</strong></div>`;

    els.readout.innerHTML =
      row("\u03C3\u2099 on plane \u03B8", `${sn.toFixed(1)} kPa`) +
      row("\u03C4 on plane \u03B8", `${tau.toFixed(1)} kPa`) +
      row(
        `Strength \u03C4<sub>f</sub> at that \u03C3\u2099`,
        `${tauF.toFixed(1)} kPa ${planeSafe ? "\u2713" : "\u2717"}`
      ) +
      row("Critical plane \u03B8<sub>f</sub> = 45\u00B0 + \u03C6/2", `${thetaF.toFixed(1)}\u00B0`) +
      row("Angle of repose \u03B1", `${alpha.toFixed(1)}\u00B0`) +
      `<span class="status ${statusClass}">${statusText}</span>`;
  }

  // ---------- canvas plumbing ----------

  function prepareCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!canvas.dataset.aspect) {
      canvas.dataset.aspect = String(canvas.height / canvas.width);
    }
    const aspect = Number(canvas.dataset.aspect);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.floor(w * aspect);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function niceStep(span, targetTicks) {
    const raw = span / targetTicks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (raw <= m * mag) return m * mag;
    }
    return 10 * mag;
  }

  // ---------- Mohr circle ----------

  function drawMohr(p) {
    const { ctx, w, h } = prepareCanvas(els.mohr);
    ctx.clearRect(0, 0, w, h);

    const pad = { l: 50, r: 18, t: 16, b: 40 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    const center = (p.s1 + p.s3) / 2;
    const radius = (p.s1 - p.s3) / 2;
    const sigmaMax = p.s1 * 1.18;

    // One scale for both axes so tangency is geometrically honest.
    const scale = Math.min(plotW / sigmaMax, (plotH / 2 - 12) / Math.max(radius * 1.15, sigmaMax * 0.22));
    const X = (s) => pad.l + s * scale;
    const zeroY = pad.t + plotH / 2;
    const Y = (t) => zeroY - t * scale;

    // grid + ticks
    const step = niceStep(sigmaMax, 6);
    ctx.font = "11px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let s = 0; s <= sigmaMax; s += step) {
      const x = X(s);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(Math.round(s)), x, zeroY + plotH / 2 + 6);
    }

    // axes
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(pad.l, zeroY);
    ctx.lineTo(pad.l + plotW, zeroY);
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("\u03C3 (kPa)", pad.l + plotW / 2, h - 6);
    ctx.save();
    ctx.translate(13, zeroY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("\u03C4 (kPa)", 0, 0);
    ctx.restore();

    // clip everything else to the plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, plotW, plotH);
    ctx.clip();

    // failure envelope (upper and lower)
    const tanPhi = Math.tan(p.phi * DEG);
    ctx.strokeStyle = COLORS.envelope;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(p.c));
    ctx.lineTo(X(sigmaMax), Y(failureShear(sigmaMax, p.phi, p.c)));
    ctx.moveTo(X(0), Y(-p.c));
    ctx.lineTo(X(sigmaMax), Y(-failureShear(sigmaMax, p.phi, p.c)));
    ctx.stroke();

    // Mohr circle
    const state = envelopeState(p.s1, p.s3, p.phi, p.c);
    const atLimit = state.failed || state.touching;
    ctx.fillStyle = atLimit ? COLORS.circleFailFill : COLORS.circleFill;
    ctx.strokeStyle = atLimit ? COLORS.envelope : COLORS.circleStable;
    ctx.lineWidth = 2.25;
    ctx.beginPath();
    ctx.arc(X(center), zeroY, radius * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // critical-plane radius (dashed) at 2θf from σ1 direction
    const thetaF = criticalPlaneAngle(p.phi);
    const aF = 2 * thetaF * DEG;
    const snF = center + radius * Math.cos(aF);
    const tauFPt = radius * Math.sin(aF);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(181,74,42,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(center), zeroY);
    ctx.lineTo(X(snF), Y(tauFPt));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.envelope;
    ctx.beginPath();
    ctx.arc(X(snF), Y(tauFPt), 4, 0, Math.PI * 2);
    ctx.fill();

    // inspection-plane radius (solid gold) at 2θ
    const a = 2 * p.theta * DEG;
    const sn = center + radius * Math.cos(a);
    const tau = radius * Math.sin(a);
    ctx.strokeStyle = COLORS.plane;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(X(center), zeroY);
    ctx.lineTo(X(sn), Y(tau));
    ctx.stroke();

    // 2θ arc: from σ1 direction (angle 0) sweeping up to the plane point
    const arcR = Math.min(30, radius * scale * 0.4);
    if (arcR > 10 && p.theta > 2) {
      ctx.strokeStyle = COLORS.plane;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(X(center), zeroY, arcR, 0, -a, true);
      ctx.stroke();
      const mid = -a / 2;
      ctx.fillStyle = COLORS.plane;
      ctx.font = "italic 13px 'Instrument Serif', Georgia, serif";
      ctx.textAlign = "left";
      ctx.fillText(
        "2\u03B8",
        X(center) + (arcR + 6) * Math.cos(mid),
        zeroY + (arcR + 6) * Math.sin(mid) + 4
      );
    }

    // plane point marker
    ctx.fillStyle = COLORS.planeFill;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(sn), Y(tau), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore(); // end clip

    // principal stress points + labels (outside clip so labels never cut off)
    ctx.fillStyle = COLORS.ink;
    ctx.font = "12px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    for (const [s, label] of [[p.s3, "\u03C3\u2083"], [p.s1, "\u03C3\u2081"]]) {
      ctx.beginPath();
      ctx.arc(X(s), zeroY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(label, X(s), zeroY + 18);
    }

    // φ label along the upper envelope
    const labelSigma = sigmaMax * 0.78;
    const lx = X(labelSigma);
    const ly = Y(failureShear(labelSigma, p.phi, p.c));
    if (ly > pad.t + 14) {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(-Math.atan(tanPhi * 1)); // slope in equal-scale space
      ctx.fillStyle = COLORS.envelope;
      ctx.font = "italic 13px 'Instrument Serif', Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(`\u03C4 = c + \u03C3 tan \u03C6`, 0, -8);
      ctx.restore();
    }
  }

  // ---------- dune ----------

  function drawDune(p) {
    const { ctx, w, h } = prepareCanvas(els.dune);
    ctx.clearRect(0, 0, w, h);

    const alpha = angleOfRepose(p.phi, p.c);
    const aRad = alpha * DEG;
    const windRad = Math.min(14, alpha * 0.45) * DEG; // gentle windward side

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, "#a9c0cf");
    sky.addColorStop(1, "#e3d7bd");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // sun
    ctx.fillStyle = "rgba(255,236,180,0.9)";
    ctx.beginPath();
    ctx.arc(w * 0.86, h * 0.2, 18, 0, Math.PI * 2);
    ctx.fill();

    const baseY = h * 0.8;
    const duneH = h * 0.46;
    const crestX = w * 0.56;
    const crestY = baseY - duneH;
    const leftToe = crestX - duneH / Math.tan(windRad);
    const rightToe = crestX + duneH / Math.tan(aRad);

    // ground
    ctx.fillStyle = "#cbb995";
    ctx.fillRect(0, baseY, w, h - baseY);
    ctx.strokeStyle = "rgba(26,23,20,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
    ctx.stroke();

    // dune body
    const sand = ctx.createLinearGradient(leftToe, crestY, rightToe, baseY);
    sand.addColorStop(0, "#ecd9ac");
    sand.addColorStop(0.55, "#d6b97c");
    sand.addColorStop(1, "#b3904f");
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(Math.min(leftToe, -20), baseY);
    ctx.lineTo(crestX, crestY);
    ctx.lineTo(rightToe, baseY);
    ctx.closePath();
    ctx.fill();

    // slip face shading (lee side is darker)
    const lee = ctx.createLinearGradient(crestX, crestY, rightToe, baseY);
    lee.addColorStop(0, "rgba(139,105,20,0.28)");
    lee.addColorStop(1, "rgba(139,105,20,0.05)");
    ctx.fillStyle = lee;
    ctx.beginPath();
    ctx.moveTo(crestX, crestY);
    ctx.lineTo(rightToe, baseY);
    ctx.lineTo(crestX, baseY);
    ctx.closePath();
    ctx.fill();

    // cross-bedding: old slip surfaces parallel to the lee face
    ctx.strokeStyle = "rgba(107,79,26,0.28)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      const startX = crestX - duneH * f * 0.02;
      const startY = crestY + duneH * f;
      const endX = startX + (duneH * (1 - f)) / Math.tan(aRad);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(Math.min(endX, rightToe), baseY);
      ctx.stroke();
    }

    // wind ripples on windward face
    ctx.strokeStyle = "rgba(120,95,50,0.25)";
    for (let i = 1; i <= 5; i++) {
      const f = i / 6;
      const y = crestY + duneH * f;
      const xEnd = crestX - (crestX - leftToe) * f * 0.9;
      const xStart = Math.max(0, xEnd - w * 0.13);
      ctx.beginPath();
      ctx.moveTo(xStart, y + 3);
      ctx.quadraticCurveTo((xStart + xEnd) / 2, y - 2, xEnd, y + 1);
      ctx.stroke();
    }

    // wind arrow
    ctx.strokeStyle = "rgba(44,74,94,0.55)";
    ctx.fillStyle = "rgba(44,74,94,0.55)";
    ctx.lineWidth = 1.5;
    const wy = h * 0.18;
    ctx.beginPath();
    ctx.moveTo(w * 0.07, wy);
    ctx.lineTo(w * 0.07 + 52, wy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.07 + 60, wy);
    ctx.lineTo(w * 0.07 + 48, wy - 5);
    ctx.lineTo(w * 0.07 + 48, wy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px 'DM Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("wind", w * 0.07, wy - 8);

    // slip face edge
    ctx.strokeStyle = "rgba(26,23,20,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(crestX, crestY);
    ctx.lineTo(rightToe, baseY);
    ctx.stroke();

    // angle arc at the right toe, between horizontal ground and the slope.
    // Canvas y points down: horizontal-left is π, the up-slope direction is π + α.
    const arcR = Math.min(64, (rightToe - crestX) * 0.42);
    ctx.strokeStyle = "#2c4a5e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rightToe, baseY, arcR, Math.PI, Math.PI + aRad, false);
    ctx.stroke();

    // dashed horizontal reference through the toe
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(44,74,94,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rightToe - arcR - 14, baseY);
    ctx.lineTo(Math.min(rightToe + 20, w - 6), baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    // α label on the bisector of the arc
    const bis = Math.PI + aRad / 2;
    const labelR = arcR + 14;
    ctx.fillStyle = "#2c4a5e";
    ctx.font = "italic 20px 'Instrument Serif', Georgia, serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `\u03B1 \u2248 ${alpha.toFixed(1)}\u00B0`,
      rightToe + labelR * Math.cos(bis),
      baseY + labelR * Math.sin(bis)
    );
    ctx.textBaseline = "alphabetic";

    // caption
    ctx.fillStyle = "rgba(26,23,20,0.6)";
    ctx.font = "12px 'DM Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      p.c < 0.5
        ? "Dry sand: slip face rests at \u03B1 \u2248 \u03C6. Steeper piles avalanche back to this angle."
        : "Cohesion lets the face stand steeper than \u03C6 \u2014 think damp sandcastle walls.",
      14,
      h - 12
    );
  }

  // ---------- wiring ----------

  function render() {
    const p = read();
    updateLabels(p);
    updateReadout(p);
    drawMohr(p);
    drawDune(p);
  }

  ["phi", "c", "s3", "s1", "theta"].forEach((id) =>
    els[id].addEventListener("input", render)
  );

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-preset");
      if (kind === "dry") {
        els.phi.value = "32";
        els.c.value = "0";
        els.s3.value = "40";
        els.s1.value = "120";
        els.theta.value = "30";
      } else if (kind === "damp") {
        els.phi.value = "30";
        els.c.value = "12";
        els.s3.value = "50";
        els.s1.value = "140";
        els.theta.value = "35";
      } else if (kind === "critical") {
        // σ1 = σ3·Nφ + 2c·√Nφ makes the circle tangent to the envelope
        const phi = Number(els.phi.value) * DEG;
        const c = Number(els.c.value);
        const s3 = Number(els.s3.value);
        const N = Math.tan(Math.PI / 4 + phi / 2) ** 2;
        const s1 = s3 * N + 2 * c * Math.sqrt(N);
        els.s1.value = String(Math.min(400, Math.max(s3 + 5, s1)));
        els.theta.value = String(criticalPlaneAngle(Number(els.phi.value)));
      }
      render();
    });
  });

  window.addEventListener("resize", render);
  render();
})();
