'use strict';

function getResult(segments) {
  const rand = Math.random();
  let cumulative = 0;
  for (const segment of segments) {
    cumulative += segment.probability;
    if (rand < cumulative) return segment;
  }
  return segments[segments.length - 1];
}

function getTargetAngle(segmentIndex, segmentCount, currentAngle) {
  const segmentAngle = (2 * Math.PI) / segmentCount;
  const fullRotations = 5 * 2 * Math.PI;

  // Centre of the winning segment, with a small random jitter (±20% of segment width)
  const jitter = (Math.random() - 0.5) * segmentAngle * 0.4;
  const segmentCentre = segmentIndex * segmentAngle + segmentAngle / 2 + jitter;

  // The pointer is at the top (−π/2). We want segmentCentre to land at the top.
  // Canvas angle 0 is 3 o'clock, so top = −π/2.
  // currentAngle offset is subtracted so we always add positive rotation.
  const pointerAngle = -Math.PI / 2;
  let targetOffset = pointerAngle - segmentCentre;

  // Normalise to [0, 2π) then add full rotations on top of currentAngle
  targetOffset = ((targetOffset % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const targetAngle = currentAngle + fullRotations + targetOffset;

  // Duration between 3 and 4.5 seconds for visual feel
  const duration = 3000 + Math.random() * 1500;

  return { targetAngle, duration };
}

function validateSegments(segments) {
  const total = segments.reduce((sum, s) => sum + s.probability, 0);
  if (Math.abs(total - 1.0) > 0.001) {
    throw new Error(
      `segments.json: probability values sum to ${total.toFixed(4)}, must equal 1.0`
    );
  }
}

module.exports = { getResult, getTargetAngle, validateSegments };
