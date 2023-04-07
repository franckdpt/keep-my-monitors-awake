let url = chrome.runtime.getURL('tone.wav')

let a = new Audio(url)

a.play()

setInterval(function(){
	a.currentTime = 0;
	a.play()
}, 600000) // 10min