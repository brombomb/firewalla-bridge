/**
 * Evaluates whether an alarm should be ignored based on Firewalla app configurations
 * or exception rules configured on the box.
 *
 * @param {object} alarm
 * @param {Array} exceptionRules
 * @param {object} appConfs
 * @returns {boolean}
 */
export function isAlarmIgnored(alarm, exceptionRules = [], appConfs = {}) {
  // 1. Check if alarm app has notifications muted (disturb: true)
  const appId = (alarm['p.dest.app.id'] || alarm['p.dest.app'] || '').toLowerCase();
  if (appId && appConfs && appConfs[appId]) {
    const conf = appConfs[appId];
    if (conf.features && conf.features.disturb === true) {
      return true;
    }
  }

  // 2. Check against exception rules configured on Firewalla
  const alarmType = alarm.type || alarm.alarm_type;
  const alarmMac = (alarm['p.device.mac'] || alarm['p.device.id'] || '').toLowerCase();
  const alarmTags = alarm['p.tag.ids'] || [];
  const alarmUtags = alarm['p.utag.ids'] || [];
  const destName = (alarm['p.dest.name'] || '').toLowerCase();
  const destDomain = (alarm['p.dest.domain'] || alarm['p.dest.name.suffix'] || '').toLowerCase();
  const destIp = alarm['p.dest.ip'] || '';

  for (const rule of exceptionRules) {
    const ruleType = rule.type || rule.alarm_type;
    if (ruleType && ruleType !== alarmType) continue;

    let deviceMatch = true;
    if (rule['p.device.mac']) {
      deviceMatch = rule['p.device.mac'].toLowerCase() === alarmMac;
    } else if (rule['p.tag.ids'] && rule['p.tag.ids'].length > 0) {
      deviceMatch = rule['p.tag.ids'].some((tid) => alarmTags.includes(tid));
    } else if (rule['p.utag.ids'] && rule['p.utag.ids'].length > 0) {
      deviceMatch = rule['p.utag.ids'].some((uid) => alarmUtags.includes(uid));
    }

    if (!deviceMatch) continue;

    const ifType = rule['if.type'];
    const ifTarget = (rule['if.target'] || '').toLowerCase();

    if (ifType === ruleType) {
      return true;
    } else if (ifType === 'dns') {
      if (ifTarget && (destName.includes(ifTarget) || destDomain.includes(ifTarget) || ifTarget.includes(destDomain))) {
        return true;
      }
    } else if (ifType === 'ip') {
      if (ifTarget && (destIp === ifTarget || destName === ifTarget)) {
        return true;
      }
    } else if (ifType === 'mac') {
      if (ifTarget && alarmMac && ifTarget.toLowerCase() === alarmMac) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns filtered active alarms.
 *
 * @param {Array} allAlarms
 * @param {Array} exceptionRules
 * @param {object} appConfs
 * @param {boolean} filterSecurityOnly
 * @returns {Array}
 */
export function getActiveAlarms(allAlarms = [], exceptionRules = [], appConfs = {}, filterSecurityOnly = false) {
  return allAlarms.filter((a) => {
    if (isAlarmIgnored(a, exceptionRules, appConfs)) {
      return false;
    }

    if (filterSecurityOnly) {
      const type = (a.type || '').toUpperCase();
      const msg = (a.message || a.desc || a.title || '').toLowerCase();
      const isSecurity =
        type.includes('INTEL') ||
        type.includes('SECURITY') ||
        type.includes('VULNERABILITY') ||
        type.includes('OPENPORT') ||
        type.includes('SPOOFING') ||
        msg.includes('blocked') ||
        msg.includes('suspicious') ||
        msg.includes('malware') ||
        msg.includes('exploit');
      return isSecurity;
    }

    return true;
  });
}
