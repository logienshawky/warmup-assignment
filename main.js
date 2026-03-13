const fs = require("fs");

// helper: converts "hh:mm:ss am/pm" to seconds
function toSeconds(timeStr) {
    timeStr = timeStr.trim();
    let parts = timeStr.split(" ");
    let period = parts[1].toLowerCase();
    let timeParts = parts[0].split(":");
    let h = parseInt(timeParts[0]);
    let m = parseInt(timeParts[1]);
    let s = parseInt(timeParts[2]);

    if (period === "am") {
        if (h === 12) h = 0;
    } else {
        if (h !== 12) h = h + 12;
    }

    return h * 3600 + m * 60 + s;
}

// helper: converts "h:mm:ss" string to total seconds
function strToSec(timeStr) {
    timeStr = timeStr.trim();
    let parts = timeStr.split(":");
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

// helper: converts seconds to "h:mm:ss" string
function secToStr(sec) {
    let h = Math.floor(sec / 3600);
    let m = Math.floor((sec % 3600) / 60);
    let s = sec % 60;
    let mm = m < 10 ? "0" + m : "" + m;
    let ss = s < 10 ? "0" + s : "" + s;
    return h + ":" + mm + ":" + ss;
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    let start = toSeconds(startTime);
    let end = toSeconds(endTime);
    return secToStr(end - start);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    let start = toSeconds(startTime);
    let end = toSeconds(endTime);
    let idle = 0;

    // delivery window is 8am to 10pm
    let delivStart = 8 * 3600;
    let delivEnd = 22 * 3600;

    // time before 8am is idle
    if (start < delivStart) {
        let idleEnd = end < delivStart ? end : delivStart;
        idle = idle + (idleEnd - start);
    }

    // time after 10pm is idle
    if (end > delivEnd) {
        let idleStart = start > delivEnd ? start : delivEnd;
        idle = idle + (end - idleStart);
    }

    return secToStr(idle);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shift = strToSec(shiftDuration);
    let idle = strToSec(idleTime);
    return secToStr(shift - idle);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    let active = strToSec(activeTime);
    let dateParts = date.trim().split("-");
    let year = parseInt(dateParts[0]);
    let month = parseInt(dateParts[1]);
    let day = parseInt(dateParts[2]);

    // Eid 2025: April 10 to April 30 → quota is 6 hours
    // normal days → quota is 8 hours 24 minutes
    let quota;
    if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
        quota = 6 * 3600;
    } else {
        quota = 8 * 3600 + 24 * 60;
    }

    return active >= quota;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let content = fs.readFileSync(textFile, "utf8");
    let lines = content.split("\n").map(function(l) { return l.replace(/\r/g, ""); });
    let rows = lines.filter(function(l) { return l.trim() !== ""; });

    // check if same driver + same date already exists → return {}
    for (let i = 1; i < rows.length; i++) {
        let cols = rows[i].split(",");
        if (cols[0].trim() === shiftObj.driverID && cols[2].trim() === shiftObj.date) {
            return {};
        }
    }

    // calculate the fields
    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quota = metQuota(shiftObj.date, activeTime);

    let record = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quota,
        hasBonus: false
    };

    let newLine = record.driverID + "," + record.driverName + "," + record.date + "," +
        record.startTime + "," + record.endTime + "," + record.shiftDuration + "," +
        record.idleTime + "," + record.activeTime + "," + record.metQuota + "," + record.hasBonus;

    // find last row with same driverID, insert after it
    // if driver not found at all, just append at the end
    let insertAt = -1;
    for (let i = 1; i < rows.length; i++) {
        let cols = rows[i].split(",");
        if (cols[0].trim() === shiftObj.driverID) {
            insertAt = i;
        }
    }

    if (insertAt === -1) {
        rows.push(newLine);
    } else {
        rows.splice(insertAt + 1, 0, newLine);
    }

    fs.writeFileSync(textFile, rows.join("\n") + "\n", "utf8");

    return record;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let content = fs.readFileSync(textFile, "utf8");
    let lines = content.split("\n").map(function(l) { return l.replace(/\r/g, ""); });

    for (let i = 0; i < lines.length; i++) {
        let cols = lines[i].split(",");
        if (cols[0].trim() === driverID && cols[2].trim() === date) {
            cols[9] = newValue.toString();
            lines[i] = cols.join(",");
            break;
        }
    }

    fs.writeFileSync(textFile, lines.join("\n"), "utf8");
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let content = fs.readFileSync(textFile, "utf8");
    let lines = content.split("\n").map(function(l) { return l.replace(/\r/g, "").trim(); });
    lines = lines.filter(function(l) { return l !== ""; });

    let targetMonth = parseInt(month);
    let found = false;
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
        let cols = lines[i].split(",");
        if (cols[0].trim() === driverID) {
            found = true;
            let rowMonth = parseInt(cols[2].trim().split("-")[1]);
            if (rowMonth === targetMonth && cols[9].trim() === "true") {
                count++;
            }
        }
    }

    if (!found) return -1;
    return count;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let content = fs.readFileSync(textFile, "utf8");
    let lines = content.split("\n").map(function(l) { return l.replace(/\r/g, "").trim(); });
    lines = lines.filter(function(l) { return l !== ""; });

    let total = 0;

    for (let i = 1; i < lines.length; i++) {
        let cols = lines[i].split(",");
        if (cols[0].trim() === driverID) {
            let rowMonth = parseInt(cols[2].trim().split("-")[1]);
            if (rowMonth === month) {
                total = total + strToSec(cols[7].trim());
            }
        }
    }

    return secToStr(total);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let shiftContent = fs.readFileSync(textFile, "utf8");
    let shiftLines = shiftContent.split("\n").map(function(l) { return l.replace(/\r/g, "").trim(); });
    shiftLines = shiftLines.filter(function(l) { return l !== ""; });

    let rateContent = fs.readFileSync(rateFile, "utf8");
    let rateLines = rateContent.split("\n").map(function(l) { return l.replace(/\r/g, "").trim(); });
    rateLines = rateLines.filter(function(l) { return l !== ""; });

    // get driver's day off from rate file
    let dayOff = "";
    for (let i = 0; i < rateLines.length; i++) {
        let cols = rateLines[i].split(",");
        if (cols[0].trim() === driverID) {
            dayOff = cols[1].trim();
            break;
        }
    }

    // map day name to number (0=Sun, 1=Mon, ... 6=Sat)
    let dayMap = { "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6 };
    let dayOffNum = dayMap[dayOff];

    let total = 0;

    for (let i = 1; i < shiftLines.length; i++) {
        let cols = shiftLines[i].split(",");
        if (cols[0].trim() === driverID) {
            let dateStr = cols[2].trim();
            let dateParts = dateStr.split("-");
            let year = parseInt(dateParts[0]);
            let rowMonth = parseInt(dateParts[1]);
            let day = parseInt(dateParts[2]);

            if (rowMonth === month) {
                // skip if this shift is on the driver's day off
                let d = new Date(dateStr);
                let dow = d.getUTCDay();
                if (dow === dayOffNum) continue;

                // add quota for this shift (Eid or normal)
                if (year === 2025 && rowMonth === 4 && day >= 10 && day <= 30) {
                    total = total + 6 * 3600;
                } else {
                    total = total + 8 * 3600 + 24 * 60;
                }
            }
        }
    }

    // each bonus cuts 2 hours from required
    total = total - bonusCount * 2 * 3600;
    if (total < 0) total = 0;

    return secToStr(total);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let content = fs.readFileSync(rateFile, "utf8");
    let lines = content.split("\n").map(function(l) { return l.replace(/\r/g, "").trim(); });
    lines = lines.filter(function(l) { return l !== ""; });

    let basePay = 0;
    let tier = 0;

    for (let i = 0; i < lines.length; i++) {
        let cols = lines[i].split(",");
        if (cols[0].trim() === driverID) {
            basePay = parseInt(cols[2].trim());
            tier = parseInt(cols[3].trim());
            break;
        }
    }

    let actual = strToSec(actualHours);
    let required = strToSec(requiredHours);

    // worked enough → full pay
    if (actual >= required) return basePay;

    // missing hours in decimal
    let missingHours = (required - actual) / 3600;

    // tier allowance (how many missing hours are forgiven)
    let allowance;
    if (tier === 1) allowance = 50;
    else if (tier === 2) allowance = 20;
    else if (tier === 3) allowance = 10;
    else allowance = 3;

    let billable = missingHours - allowance;

    // within allowance → full pay
    if (billable <= 0) return basePay;

    // only whole hours count
    let fullHours = Math.floor(billable);
    let ratePerHour = Math.floor(basePay / 185);
    let deduction = fullHours * ratePerHour;

    return basePay - deduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
