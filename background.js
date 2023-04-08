let isExtensionOn = true;
chrome.browserAction.setIcon({ path: { "16": "/images/awake-logo-on16.png",
                                       "32": "/images/awake-logo-on32.png",
                                       "48": "/images/awake-logo-on48.png",
                                   	   "128": "/images/awake-logo-on128.png"} });
let timeoutID;

chrome.browserAction.onClicked.addListener(function(tab) {
  if(isExtensionOn) {
    isExtensionOn = false;
    chrome.browserAction.setIcon({ path: { "16": "/images/awake-logo-off16.png",
                                       "32": "/images/awake-logo-off32.png",
                                       "48": "/images/awake-logo-off48.png",
                                   	   "128": "/images/awake-logo-off128.png"} });
    clearTimeout(timeoutID);
  } else {
    isExtensionOn = true;
    chrome.browserAction.setIcon({ path: { "16": "/images/awake-logo-on16.png",
                                       "32": "/images/awake-logo-on32.png",
                                       "48": "/images/awake-logo-on48.png",
                                   	   "128": "/images/awake-logo-on128.png"} });
    playSound();
  }
});

function playSound() {
  if(isExtensionOn) {
    let url = chrome.runtime.getURL('tone.wav')
    let a = new Audio(url)
    a.play()
    timeoutID = setTimeout(function(){
        a.pause();
        a.currentTime = 0;
        playSound();
    }, 600000) // 10min
  }
}

playSound();
