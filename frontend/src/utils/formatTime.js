//^ formatTimestamp: converts a message timestamp into "Just now / X minutes ago / X hours ago / X days ago"

export default function formatTimestamp(timestamp) {
    //~ current time in milliseconds
    const now = Date.now();

    //~ new Date(timestamp) 👉 creates a Date object and .getTime() 👉 returns the time in milliseconds since 1970-01-01 UTC [January 1st, 1970 at 00:00:00 (midnight) in UTC time zone.In JavaScript, this date is called the Unix Epoch — the “starting point” from which all timestamps (in milliseconds) are counted.]
    const messageTime = new Date(timestamp).getTime();

    //~ difference between now and the message time (ms)
    const diff = now - messageTime;

    //~ If the message is very recent (less than 1 minute), show "Just now"
    if (diff < 60000) return 'Just now';

    //~ If less than 1 hour, show minutes ago
    //~ Math.floor(diff / 60000) converts ms -> whole minutes
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;

    //~ If less than 24 hours, show hours ago
    //~ Math.floor(diff / 3600000) converts ms -> whole hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;

    //~ Otherwise show days ago
    //~ Math.floor(diff / 86400000) converts ms -> whole days
    return `${Math.floor(diff / 86400000)} days ago`;
}
