import React from 'react'
import formatTimestamp from '../../utils/formatTime'
import useStatusStore from '../../stores/useStatusStore'

function StatusList({ contact, onPreview, theme, user }) {
    const statusViewersMap = useStatusStore(state => state.statusViewersMap);
    const myId = user?._id?.toString();

    //^ Find the last status of the contact
    const lastStatus = contact.statuses?.length > 0 
        ? contact.statuses[contact.statuses.length - 1] 
        : null;

    //^ Check if the last status has been viewed by the current user
    const isLastStatusViewed = lastStatus ? 
        (statusViewersMap.get(lastStatus._id?.toString()) || lastStatus.viewers || [])
            .some(v => {
                const viewerId = v?.user?._id?.toString() || v?.user?.toString() || v?.toString();
                return viewerId === myId;
            })
        : false;

    //& blur class (Tailwind)
    const blurClass = !isLastStatusViewed && lastStatus ? 'blur-[2px]' : '';

    //^ Function to render the content inside the avatar circle based on the last status
    const renderAvatarContent = () => {
        if (!lastStatus) {
            //& If no status, show profile picture or avatar
            return (
                <img
                    src={contact?.profilePicture || contact?.avatar}
                    alt={contact?.username}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${contact?.username || 'User'}&background=random`;
                    }}
                />
            );
        }

        //^ If there's a status, show the media or caption based on content type
        if (lastStatus.contentType === 'image') {
            return (
                <img
                    src={lastStatus.media}
                    alt="status"
                    className={`h-full w-full object-cover ${blurClass}`}
                />
            );
        }
        if (lastStatus.contentType === 'video') {
            return (
                <div className="relative h-full w-full">
                    <video
                        src={lastStatus.media}
                        className={`h-full w-full object-cover ${blurClass}`}
                        muted
                    />
                    {blurClass && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <div className="w-4 h-4 bg-white rounded-full"></div>
                        </div>
                    )}
                </div>
            );
        }
        //& text status
        return (
            <div
                className={`h-full w-full text-[10px] bg-green-100 flex items-center justify-center font-bold text-center p-1 
                    ${blurClass} ${theme === 'dark' ? "text-white" : "text-gray-700"}`}
                style={{ wordBreak: 'break-word' }}
            >
                {lastStatus.caption || lastStatus.media || 'Text'}
            </div>
        );
    };

    return (
        <div
            className={`flex items-center space-x-4 p-2 cursor-pointer rounded-lg transition-colors
                ${theme === 'dark' ? "hover:bg-gray-800" : "hover:bg-gray-200"}`}
            onClick={onPreview}
        >
            <div className='relative'>
                {/*//& Show the content of status inside the circle */}
                <div className="h-14 w-14 rounded-full overflow-hidden">
                    {renderAvatarContent()}
                </div>

                {/*//&  RING  */}
                <svg className='absolute -top-[2px] -left-[2px] w-[60px] h-[60px] rotate-90' viewBox='0 0 100 100'>
                    {contact.statuses?.map((status, index) => {
                        const count = contact.statuses.length;
                        const radius = 48;
                        const circumference = 2 * Math.PI * radius;
                        const segmentLength = circumference / count;
                        const gap = count > 1 ? 9 : 0;

                        const visibleLength = Math.max(0, segmentLength - gap);
                        const invisibleLength = circumference - visibleLength;
                        const dashArray = `${visibleLength} ${invisibleLength}`;

                        const offset = index * segmentLength;

                        const sId = status._id?.toString();
                        const viewers = statusViewersMap.get(sId) || status.viewers || [];
                        const hasViewed = viewers.some(v => {
                            const viewerId = v?.user?._id?.toString() || v?.user?.toString() || v?.toString();
                            return viewerId === myId;
                        });

                        return (
                            <circle
                                key={sId || index}
                                cx='50'
                                cy='50'
                                r={radius}
                                fill='none'
                                stroke={hasViewed ? '#94a3b8' : '#22c55e'}
                                strokeWidth='4'
                                strokeDasharray={dashArray}
                                strokeDashoffset={-offset}
                                strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
            </div>

            <div className="flex-1 min-w-0">
                <p className={`font-semibold truncate ${theme === 'dark' ? "text-white" : "text-black"}`}>
                    {contact?.username || contact?.name}
                </p>
                <p className={`text-sm ${theme === 'dark' ? "text-gray-400" : "text-gray-500"}`}>
                    {lastStatus && formatTimestamp(lastStatus.timeStamp)}
                </p>
            </div>
        </div>
    );
}

export default StatusList