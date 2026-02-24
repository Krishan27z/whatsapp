import React from 'react'
import formatTimestamp from '../../utils/formatTime'
import useStatusStore from '../../stores/useStatusStore'
import { useShallow } from 'zustand/react/shallow'

function StatusList({ contact, onPreview, theme, user }) {
    // 1. Directly store theke map ta ano
    const statusViewersMap = useStatusStore(state => state.statusViewersMap);
    const myId = user?._id?.toString();

    return (
        <div
            className={`flex items-center space-x-4 p-2 cursor-pointer rounded-lg transition-colors
                ${theme === 'dark' ? "hover:bg-gray-800" : "hover:bg-gray-200"}`}
            onClick={onPreview}
        >
            <div className='relative'>
                <img
                    src={contact?.profilePicture || contact?.avatar}
                    alt={contact?.username}
                    className='h-14 w-14 rounded-full object-cover p-[3px]'
                    onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${contact?.username || 'User'}&background=random`;
                    }}
                />

                <svg className='absolute top-0 left-0 w-14 h-14 rotate-90' viewBox='0 0 100 100'>
                    {contact.statuses.map((status, index) => {
                        const count = contact.statuses.length;
                        const radius = 48;
                        const circumference = 2 * Math.PI * radius;
                        const segmentLength = circumference / count;
                        const gap = count > 1 ? 8 : 0;

                        // 🔥 REAL FIX: 
                        // dashArray te bolte hobe kotota stroke hobe, ar kotota gap hobe.
                        // Visible hobe (segmentLength - gap), ar baki Pura circle ta INVISIBLE thakbe.
                        const visibleLength = Math.max(0, segmentLength - gap);
                        const invisibleLength = circumference - visibleLength;
                        const dashArray = `${visibleLength} ${invisibleLength}`;

                        // Offset thik ache
                        const offset = index * segmentLength;

                        // Tor DB check ekdom perfect chilo agei
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
                                // Dekhle Gray, Na dekhle Green
                                stroke={hasViewed ? '#94a3b8' : '#22c55e'}
                                strokeWidth='4'
                                strokeDasharray={dashArray}
                                strokeDashoffset={-offset}
                                strokeLinecap="round" // Optional: edge gulo sundor korar jonno
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
                    {contact.statuses.length > 0 && formatTimestamp(contact.statuses[contact.statuses.length - 1].timeStamp)}
                </p>
            </div>
        </div>
    );
}

export default StatusList;