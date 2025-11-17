const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DataStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.dir = path.dirname(filePath);
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      this.data = this.defaultData();
      this.persist();
    } else {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.data = raw ? JSON.parse(raw) : this.defaultData();
    }
  }

  defaultData() {
    const now = new Date();
    const upcoming = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
    const end = new Date(upcoming.getTime() + 1000 * 60 * 60 * 24);
    return {
      signups: [],
      fieldNotes: this.seedFieldNotes(),
      testimonials: [],
      dropWindows: [
        {
          id: crypto.randomUUID(),
          name: 'Drop 01',
          startAt: upcoming.toISOString(),
          endAt: end.toISOString(),
          waitlistCopy: 'Waitlist only. Confirm your spot to get first access.',
          liveCopy: 'Drop window is live — secure your SNOOOM Hoodie now.',
          postCopy: 'This drop is closed. Join the list for the next run.'
        }
      ],
      events: []
    };
  }

  seedFieldNotes() {
    return [
      'Feels like something you’d thrift once and never find again. The weight, the drape—everything just clicks.|Nate · Visual Designer',
      'Has that old athletic department energy, but cleaned up. Like a hoodie they would’ve kept locked in the archives.|Lex · Creative Runner',
      'Wore it from a coffee run to a night session in the studio. Never stretched out, never lost shape.|Mila · Photographer',
      'The embroidery hits in person. People keep asking where it’s from every time I wear it.|Dre · DJ & Curator',
      'This is the hoodie I grab when I don’t want to overthink the outfit but still want it to feel intentional.|Talia · Art Director',
      'It has that vintage varsity DNA, but the fit is modern and clean. Not loud, just confident.|Sage · Creative Consultant',
      'Put it on for a flight and kept it on all weekend. Warm, heavy, and weirdly reassuring.|Emi · DJ & Stylist',
      'The hood actually holds its shape. No floppy sides, no weird collapse. It frames your face properly.|Jordan · Creative Director',
      'The inside feels like brushed fleece, the outside looks structured and sharp. It photographs insanely well.|Kei · Filmmaker',
      'Finally a hoodie that works for meetings, late-night drives, and early shoots without feeling try-hard.|Lina · Founder',
      'It hangs off the shoulders perfectly. Relaxed, but not sloppy. You can tell someone obsessed over the fit.|Max · Stylist',
      'The kind of hoodie that makes jeans, cargos, or sweats all feel like a full fit.|Ro · Brand Strategist',
      'Even after a few washes, the embroidery still looks crisp and raised. No sagging, no fuzz.|Cam · Textile Designer',
      'You put it on and instantly get that “archive piece” feeling, like it already has a story.|Imani · Writer',
      'Heavy enough for late-night walks, soft enough to crash on the sofa in. Basically lives on my chair now.|Eli · Producer',
      'The navy, cream and red combo just feels right. Classic but still different from what everyone else is wearing.|Noor · Creative Assistant',
      'It layers over tees and under coats without bunching. Whoever designed the pattern knew what they were doing.|Jay · Art Student',
      'Every time I go to hang it back up, I end up putting it back on. That’s the kind of piece this is.|Hana · Curator',
      'The ribbing at the cuffs and hem actually does its job. The silhouette stays clean all day.|Luca · Motion Designer',
      'It feels built for late nights, early mornings, and everything in between. Quiet, solid, reliable.|Kai · Creative Producer'
    ].map((row, idx) => {
      const [quote, author] = row.split('|');
      return {
        id: crypto.randomUUID(),
        quote,
        author,
        active: true,
        createdAt: new Date().toISOString(),
        order: idx
      };
    });
  }

  persist() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  nextReferralCode() {
    return `REF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  nextAccessCode() {
    return `SNOOOM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  nextToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  upsertSignup(payload) {
    const existing = this.data.signups.find(s => s.email === payload.email);
    if (existing) {
      return { existing: true, record: existing };
    }
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      name: payload.name,
      email: payload.email,
      size: payload.size,
      referralCode: this.nextReferralCode(),
      referredByCode: payload.referredByCode || null,
      referralCount: 0,
      confirmed: false,
      confirmationToken: this.nextToken(),
      earlyAccessCode: this.nextAccessCode(),
      earlyAccessMaxUses: 1,
      earlyAccessUses: 0,
      earlyAccessExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      createdAt: now,
      updatedAt: now
    };
    this.data.signups.push(record);
    if (record.referredByCode) {
      const referrer = this.data.signups.find(s => s.referralCode === record.referredByCode);
      if (referrer) {
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        referrer.updatedAt = now;
      }
    }
    this.persist();
    return { existing: false, record };
  }

  confirmSignup(token) {
    const signup = this.data.signups.find(s => s.confirmationToken === token);
    if (!signup) return null;
    signup.confirmed = true;
    signup.confirmationToken = null;
    signup.updatedAt = new Date().toISOString();
    this.persist();
    return signup;
  }

  incrementCodeUsage(code) {
    const signup = this.data.signups.find(s => s.earlyAccessCode === code);
    if (!signup) return { success: false, reason: 'Code not found' };
    if (new Date(signup.earlyAccessExpiresAt) < new Date()) {
      return { success: false, reason: 'Code expired' };
    }
    if (signup.earlyAccessUses >= signup.earlyAccessMaxUses) {
      return { success: false, reason: 'Code already used' };
    }
    signup.earlyAccessUses += 1;
    signup.updatedAt = new Date().toISOString();
    this.persist();
    return { success: true, signup };
  }

  getSizeCounts() {
    const summary = {};
    this.data.signups.forEach(signup => {
      summary[signup.size] = (summary[signup.size] || 0) + 1;
    });
    return summary;
  }

  getSignupTimeline() {
    const counts = {};
    this.data.signups.forEach(signup => {
      const day = signup.createdAt.slice(0, 10);
      counts[day] = (counts[day] || 0) + 1;
    });
    return Object.entries(counts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }

  getReferrals(limit = 10) {
    return [...this.data.signups]
      .sort((a, b) => (b.referralCount || 0) - (a.referralCount || 0))
      .slice(0, limit)
      .map(({ name, email, referralCount = 0, referralCode }) => ({ name, email, referralCount, referralCode }));
  }

  listSignups({ size, confirmed, start, end } = {}) {
    return this.data.signups.filter(signup => {
      if (size && signup.size !== size) return false;
      if (typeof confirmed === 'boolean' && signup.confirmed !== confirmed) return false;
      if (start && signup.createdAt < start) return false;
      if (end && signup.createdAt > end) return false;
      return true;
    });
  }

  logEvent(event) {
    this.data.events.push({
      id: crypto.randomUUID(),
      ...event,
      createdAt: new Date().toISOString()
    });
    this.persist();
  }

  getEventSummary() {
    const byType = {};
    const byDay = {};
    this.data.events.forEach(evt => {
      byType[evt.type] = (byType[evt.type] || 0) + 1;
      const day = evt.createdAt.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    return {
      byType,
      byDay: Object.entries(byDay).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  getFieldNotes() {
    return this.data.fieldNotes.filter(note => note.active !== false);
  }

  addFieldNote(note) {
    const record = {
      id: crypto.randomUUID(),
      quote: note.quote,
      author: note.author,
      active: note.active !== false,
      createdAt: new Date().toISOString(),
      order: this.data.fieldNotes.length
    };
    this.data.fieldNotes.push(record);
    this.persist();
    return record;
  }

  updateFieldNote(id, payload) {
    const note = this.data.fieldNotes.find(n => n.id === id);
    if (!note) return null;
    Object.assign(note, payload, { updatedAt: new Date().toISOString() });
    this.persist();
    return note;
  }

  deleteFieldNote(id) {
    const index = this.data.fieldNotes.findIndex(n => n.id === id);
    if (index === -1) return false;
    this.data.fieldNotes.splice(index, 1);
    this.persist();
    return true;
  }

  getTestimonials() {
    return this.data.testimonials;
  }

  addTestimonial(payload) {
    const record = {
      id: crypto.randomUUID(),
      quote: payload.quote,
      author: payload.author,
      role: payload.role || '',
      createdAt: new Date().toISOString(),
      active: payload.active !== false
    };
    this.data.testimonials.push(record);
    this.persist();
    return record;
  }

  updateTestimonial(id, payload) {
    const record = this.data.testimonials.find(t => t.id === id);
    if (!record) return null;
    Object.assign(record, payload, { updatedAt: new Date().toISOString() });
    this.persist();
    return record;
  }

  deleteTestimonial(id) {
    const index = this.data.testimonials.findIndex(t => t.id === id);
    if (index === -1) return false;
    this.data.testimonials.splice(index, 1);
    this.persist();
    return true;
  }

  getDropState(now = new Date()) {
    if (!this.data.dropWindows.length) {
      return { state: 'waitlist', message: 'Waitlist only', window: null };
    }
    const current = this.data.dropWindows[0];
    const start = new Date(current.startAt);
    const end = new Date(current.endAt);
    if (now < start) {
      return { state: 'waitlist', message: current.waitlistCopy, window: current };
    }
    if (now >= start && now <= end) {
      return { state: 'live', message: current.liveCopy, window: current };
    }
    return { state: 'post', message: current.postCopy, window: current };
  }
}

module.exports = DataStore;
