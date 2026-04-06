import SunCalc from 'suncalc';

const lat = 38.7223;
const lng = -9.1393;

// Case 1: March 1st, 18:30 (Local time = UTC+0)
// March is month 2 (0-indexed)
const date1 = new Date(Date.UTC(2024, 2, 1, 18, 30)); 
const pos1 = SunCalc.getPosition(date1, lat, lng);
const alt1Degrees = pos1.altitude * 180 / Math.PI;

console.log(`Case 1: March 1st, 18:30 UTC`);
console.log(`Date: ${date1.toISOString()}`);
console.log(`Altitude (rad): ${pos1.altitude}`);
console.log(`Altitude (deg): ${alt1Degrees}`);

// Case 2: April 1st, 18:30 (Local time = UTC+1)
// April is month 3 (0-indexed)
// 18:30 UTC+1 is 17:30 UTC
const date2 = new Date(Date.UTC(2024, 3, 1, 17, 30));
const pos2 = SunCalc.getPosition(date2, lat, lng);
const alt2Degrees = pos2.altitude * 180 / Math.PI;

console.log(`\nCase 2: April 1st, 18:30 UTC+1 (17:30 UTC)`);
console.log(`Date: ${date2.toISOString()}`);
console.log(`Altitude (rad): ${pos2.altitude}`);
console.log(`Altitude (deg): ${alt2Degrees}`);
