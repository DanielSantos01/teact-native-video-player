import React, { Component } from 'react';
import Video from 'react-native-video';
import {
  TouchableWithoutFeedback,
  TouchableHighlight,
  TouchableOpacity,
  PanResponder,
  StyleSheet,
  Animated,
  SafeAreaView,
  Easing,
  Image,
  View,
  Dimensions,
  Text,
  AppState,
} from 'react-native';
import { PlayButton } from './VideoPlayerComponents/components';
import padStart from 'lodash/padStart';
import MusicControl from 'react-native-music-control';
import VideoSettings from './VideoSettings';
import { Slider } from './VideoPlayerComponents';

export default class Player extends Component {
  static defaultProps = {
    toggleResizeModeOnFullscreen: true,
    controlAnimationTiming: 500,
    doubleTapTime: 130,
    playInBackground: false,
    playWhenInactive: false,
    resizeMode: 'contain',
    isFullscreen: false,
    showOnStart: true,
    paused: false,
    repeat: false,
    muted: false,
    volume: 1,
    title: '',
    rate: 1,
  };

  constructor(props) {
    super(props);

    /**
     * All of our values that are updated by the
     * methods and listeners in this class
     */
    this.state = {
      // Video
      resizeMode: this.props.resizeMode,
      paused: this.props.paused,
      muted: this.props.muted,
      volume: this.props.volume,
      rate: this.props.rate,
      isFavorite: this.props.isFavorite,
      isVideoSettingsOpen: this.props.isVideoSettingsOpen || false,
      isFullscreen: true,
      showTimeRemaining: true,
      volumeTrackWidth: 0,
      volumeFillWidth: 0,
      seekerFillWidth: 0,
      showControls: this.props.showOnStart,
      volumePosition: 0,
      seekerPosition: 0,
      volumeOffset: 0,
      seekerOffset: 0,
      seeking: false,
      originallyPaused: false,
      scrubbing: false,
      loading: false,
      currentTime: 0,
      error: false,
      duration: 0,
      appState: AppState.currentState
    };

    /**
     * Any options that can be set at init.
     */
    this.opts = {
      playWhenInactive: this.props.playWhenInactive,
      playInBackground: this.props.playInBackground,
      repeat: this.props.repeat,
      title: this.props.title,
    };

    /**
     * Our app listeners and associated methods
     */
    this.events = {
      onError: this.props.onError || this._onError.bind(this),
      onBack: this.props.onBack || this._onBack.bind(this),
      onEnd: this.props.onEnd || this._onEnd.bind(this),
      onScreenTouch: this._onScreenTouch.bind(this),
      onEnterFullscreen: this.props.onEnterFullscreen,
      onExitFullscreen: this.props.onExitFullscreen,
      onShowControls: this.props.onShowControls,
      onHideControls: this.props.onHideControls,
      onLoadStart: this._onLoadStart.bind(this),
      onProgress: this._onProgress.bind(this),
      onSeek: this._onSeek.bind(this),
      onLoad: this._onLoad.bind(this),
      onPause: this.props.onPause,
      onPlay: this.props.onPlay,
    };

    /**
     * Functions used throughout the application
     */
    this.methods = {
      toggleFullscreen: this._toggleFullscreen.bind(this),
      togglePlayPause: this._togglePlayPause.bind(this),
      toggleControls: this._toggleControls.bind(this),
      toggleTimer: this._toggleTimer.bind(this),
    };

    /**
     * Player information
     */
    this.player = {
      controlTimeoutDelay: this.props.controlTimeout || 15000,
      volumePanResponder: PanResponder,
      seekPanResponder: PanResponder,
      controlTimeout: null,
      tapActionTimeout: null,
      volumeWidth: 150,
      iconOffset: 0,
      seekerWidth: 0,
      ref: Video,
      scrubbingTimeStep: this.props.scrubbing || 0,
      tapAnywhereToPause: this.props.tapAnywhereToPause,
    };



    MusicControl.enableControl('play', true);
    MusicControl.enableControl('pause', true);
    MusicControl.enableControl('nextTrack', true);
    MusicControl.enableControl('previousTrack', true);

    // Changing track position on lockscreen
    MusicControl.enableControl('changePlaybackPosition', true);

    MusicControl.enableControl('seek', true); // Android only
    MusicControl.enableControl('closeNotification', true, { when: 'always' });
    MusicControl.enableControl('volume', true); // Only affected when remoteVolume is enabled
    MusicControl.enableBackgroundMode(true);

    MusicControl.updatePlayback({
      state: MusicControl.STATE_PLAYING,
    });
    MusicControl.on('play', () => {
      MusicControl.updatePlayback({
        state: MusicControl.STATE_PLAYING,
        elapsedTime: this.state.currentTime,
      });
      this.videoAction(false);
    });

    MusicControl.on('pause', () => {
      MusicControl.updatePlayback({
        state: MusicControl.STATE_PAUSED,
        elapsedTime: this.state.currentTime,
      });
      this.videoAction(true);
    });
    MusicControl.on('nextTrack', () => {
      this.props.nextMedia();
    });

    MusicControl.on('previousTrack', () => {
      this.props.previousMedia();
    });

    MusicControl.on('seek', (pros) => {
      this.seekTo(pros);
      MusicControl.updatePlayback({
        //state: MusicControl.STATE_PLAYING,
        elapsedTime: pros
      })
    });

    MusicControl.on('changePlaybackPosition', (pros) => {
      MusicControl.updatePlayback({
        //state: MusicControl.STATE_PLAYING,
        elapsedTime: pros
      })
      this.seekTo(pros);
    });

    const initialValue = this.props.showOnStart ? 1 : 0;

    this.animations = {
      bottomControl: {
        marginBottom: new Animated.Value(0),
        opacity: new Animated.Value(initialValue),
      },
      topControl: {
        marginTop: new Animated.Value(0),
        opacity: new Animated.Value(initialValue),
      },
      video: {
        opacity: new Animated.Value(1),
      },
      loader: {
        rotate: new Animated.Value(0),
        MAX_VALUE: 360,
      },
    };

    /**
     * Various styles that be added...
     */
    this.styles = {
      videoStyle: this.props.videoStyle || {},
      containerStyle: this.props.style || {},
    };
  }
  componentDidMount() {
    const position = this.calculateVolumePositionFromVolume();
    let state = this.state;
    this.setVolumePosition(position);
    state.volumeOffset = position;
    this.mounted = true;

    this.setState(state);

    MusicControl.handleAudioInterruptions(true);
    MusicControl.enableBackgroundMode(true);

    AppState.addEventListener("change", this._handleAppStateChange);
  }

  _handleAppStateChange = (nextAppState) => {
    this.setMusicControls();
    MusicControl.updatePlayback({
      // state: MusicControl.STATE_PAUSED,
      elapsedTime: this.state.currentTime,
    });
  };

  _onLoadStart() {
    let state = this.state;
    state.loading = true;
    this.loadAnimation();
    this.setState(state);

    if (typeof this.props.onLoadStart === 'function') {
      this.props.onLoadStart(...arguments);
    }
  }

  /**
   * When load is finished we hide the load icon
   * and hide the controls. We also set the
   * video duration.
   *
   * @param {object} data The video meta data
   */
  _onLoad(data = {}) {
    MusicControl.setNowPlaying({
      title: this.props.title,
      // artwork: 'https://i.imgur.com/e1cpwdo.png', // URL or RN's image require()
      // artist: 'Michael Jackson',
      duration: data.duration, // (Seconds)
      color: 0xffffff, // Android Only - Notification Color
    })

    let state = this.state;

    state.duration = data.duration;
    state.loading = false;
    this.setState(state);

    if (state.showControls) {
      this.setControlTimeout();
    }

    if (typeof this.props.onLoad === 'function') {
      this.props.onLoad(...arguments);
    }
  }

  setMusicControls() {
    MusicControl.setNowPlaying({
      title: this.props.title,
      // artwork: 'https://i.imgur.com/e1cpwdo.png', // URL or RN's image require()
      // artist: 'Michael Jackson',
      duration: this.state.duration,
      color: 0xffffff, // Android Only - Notification Color
    })
  }

  /**
   * For onprogress we fire listeners that
   * update our seekbar and timer.
   *
   * @param {object} data The video meta data
   */
  videoAction(data) {
    this.setState({ paused: data });
  }
  _onProgress(data = {}) {
    let state = this.state;
    if (!state.scrubbing) {
      state.currentTime = data.currentTime;

      if (!state.seeking) {
        const position = this.calculateSeekerPosition();
        this.setSeekerPosition(position);
      }

      if (typeof this.props.onProgress === 'function') {
        this.props.onProgress(...arguments);
      }

      this.setState(state);
    }
  }

  _onSeek(time) {
    if (typeof time !== 'number') return;

    MusicControl.updatePlayback({ elapsedTime: time });
    this.setState({ scrubbing: false, currentTime: time });

    if (this.state.seeking) return;
    this.setControlTimeout();
    this.setState({ paused: this.state.originallyPaused});
  }

  /**
   * It is suggested that you override this
   * command so your app knows what to do.
   * Either close the video or go to a
   * new page.
   */
  _onEnd() { }

  /**
   * Set the error state to true which then
   * changes our renderError function
   *
   * @param {object} err  Err obj returned from <Video> component
   */
  _onError(err) {
    let state = this.state;
    state.error = true;
    state.loading = false;

    this.setState(state);
  }

  /**
   * This is a single and double tap listener
   * when the user taps the screen anywhere.
   * One tap toggles controls and/or toggles pause,
   * two toggles fullscreen mode.
   */
  _onScreenTouch() {
    if (this.player.tapActionTimeout) {
      clearTimeout(this.player.tapActionTimeout);
      this.player.tapActionTimeout = 0;
      this.methods.toggleFullscreen();
      const state = this.state;
      if (state.showControls) {
        this.resetControlTimeout();
      }
    } else {
      this.player.tapActionTimeout = setTimeout(() => {
        const state = this.state;
        if (this.player.tapAnywhereToPause && state.showControls) {
          this.methods.togglePlayPause();
          this.resetControlTimeout();
        } else {
          this.methods.toggleControls();
        }
        this.player.tapActionTimeout = 0;
      }, this.props.doubleTapTime);
    }
  }

  /**
    | -------------------------------------------------------
    | Methods
    | -------------------------------------------------------
    |
    | These are all of our functions that interact with
    | various parts of the class. Anything from
    | calculating time remaining in a video
    | to handling control operations.
    |
    */

  /**
   * Set a timeout when the controls are shown
   * that hides them after a length of time.
   * Default is 15s
   */
  setControlTimeout() {
    this.player.controlTimeout = setTimeout(() => {
      this._hideControls();
    }, this.player.controlTimeoutDelay);
  }

  /**
   * Clear the hide controls timeout.
   */
  clearControlTimeout() {
    clearTimeout(this.player.controlTimeout);
  }

  /**
   * Reset the timer completely
   */
  resetControlTimeout() {
    this.clearControlTimeout();
    this.setControlTimeout();
  }

  /**
   * Animation to hide controls. We fade the
   * display to 0 then move them off the
   * screen so they're not interactable
   */
  hideControlAnimation() {
    Animated.parallel([
      Animated.timing(this.animations.topControl.opacity, {
        toValue: 0,
        duration: this.props.controlAnimationTiming,
        useNativeDriver: false,
      }),
      Animated.timing(this.animations.topControl.marginTop, {
        toValue: -100,
        duration: this.props.controlAnimationTiming,
        useNativeDriver: false,
      }),
      Animated.timing(this.animations.bottomControl.opacity, {
        toValue: 0,
        duration: this.props.controlAnimationTiming,
        useNativeDriver: false,
      }),
      Animated.timing(this.animations.bottomControl.marginBottom, {
        toValue: -100,
        duration: this.props.controlAnimationTiming,
        useNativeDriver: false,
      }),
    ]).start();
  }

  /**
   * Animation to show controls...opposite of
   * above...move onto the screen and then
   * fade in.
   */
  showControlAnimation() {
    Animated.parallel([
      Animated.timing(this.animations.topControl.opacity, {
        toValue: 1,
        useNativeDriver: false,
        duration: this.props.controlAnimationTiming,
      }),
      Animated.timing(this.animations.topControl.marginTop, {
        toValue: 0,
        useNativeDriver: false,
        duration: this.props.controlAnimationTiming,
      }),
      Animated.timing(this.animations.bottomControl.opacity, {
        toValue: 1,
        useNativeDriver: false,
        duration: this.props.controlAnimationTiming,
      }),
      Animated.timing(this.animations.bottomControl.marginBottom, {
        toValue: 0,
        useNativeDriver: false,
        duration: this.props.controlAnimationTiming,
      }),
    ]).start();
  }

  /**
   * Loop animation to spin loader icon. If not loading then stop loop.
   */
  loadAnimation() {
    if (this.state.loading) {
      Animated.sequence([
        Animated.timing(this.animations.loader.rotate, {
          toValue: this.animations.loader.MAX_VALUE,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(this.animations.loader.rotate, {
          toValue: 0,
          duration: 0,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ]).start(this.loadAnimation.bind(this));
    }
  }

  /**
   * Function to hide the controls. Sets our
   * state then calls the animation.
   */
  _hideControls() {
    if (this.mounted) {
      let state = this.state;
      state.showControls = false;
      this.hideControlAnimation();
      typeof this.events.onHideControls === 'function' &&
        this.events.onHideControls();

      this.setState(state);
    }
  }

  /**
   * Function to toggle controls based on
   * current state.
   */
  _toggleControls() {
    let state = this.state;
    state.showControls = !state.showControls;

    if (state.showControls) {
      this.showControlAnimation();
      this.setControlTimeout();
      typeof this.events.onShowControls === 'function' &&
        this.events.onShowControls();
    } else {
      this.hideControlAnimation();
      this.clearControlTimeout();
      typeof this.events.onHideControls === 'function' &&
        this.events.onHideControls();
    }

    this.setState(state);
  }

  /**
   * Toggle fullscreen changes resizeMode on
   * the <Video> component then updates the
   * isFullscreen state.
   */
  _toggleFullscreen() {
    let state = this.state;

    state.isFullscreen = !state.isFullscreen;

    if (this.props.toggleResizeModeOnFullscreen) {
      state.resizeMode = state.isFullscreen === true ? 'cover' : 'contain';
    }

    if (state.isFullscreen) {
      typeof this.events.onEnterFullscreen === 'function' &&
        this.events.onEnterFullscreen();
    } else {
      typeof this.events.onExitFullscreen === 'function' &&
        this.events.onExitFullscreen();
    }

    this.setState(state);
  }

  /**
   * Toggle playing state on <Video> component
   */
  _togglePlayPause() {
    let state = this.state;
    state.paused = !state.paused;

    if (state.paused) {
      typeof this.events.onPause === 'function' && this.events.onPause();
      MusicControl.updatePlayback({
        state: MusicControl.STATE_PAUSED,
        elapsedTime: this.state.currentTime,
      });
    } else {
      typeof this.events.onPlay === 'function' && this.events.onPlay();
      MusicControl.updatePlayback({
        state: MusicControl.STATE_PLAYING,
        elapsedTime: this.state.currentTime,
      });
    }

    this.setState(state);
  }

  /**
   * Toggle between showing time remaining or
   * video duration in the timer control
   */
  _toggleTimer() {
    let state = this.state;
    state.showTimeRemaining = !state.showTimeRemaining;
    this.setState(state);
  }

  /**
   * The default 'onBack' function pops the navigator
   * and as such the video player requires a
   * navigator prop by default.
   */
  _onBack() {
    if (this.props.navigator && this.props.navigator.pop) {
      this.props.navigator.pop();
    } else {
      console.warn(
        'Warning: _onBack requires navigator property to function. Either modify the onBack prop or pass a navigator prop',
      );
    }
  }

  /**
   * Calculate the time to show in the timer area
   * based on if they want to see time remaining
   * or duration. Formatted to look as 00:00.
   */
  calculateTime() {
    if (this.state.showTimeRemaining) {
      const time = this.state.duration - this.state.currentTime;
      return `-${this.formatTime(time)}`;
    }

    return this.formatTime(this.state.currentTime);
  }

  /**
   * Format a time string as mm:ss
   *
   * @param {int} time time in milliseconds
   * @return {string} formatted time string in mm:ss format
   */
  formatTime(time = 0) {
    const symbol = this.state.showRemainingTime ? '-' : '';
    time = Math.min(Math.max(time, 0), this.state.duration);

    const formattedMinutes = padStart(Math.floor(time / 60).toFixed(0), 2, 0);
    const formattedSeconds = padStart(Math.floor(time % 60).toFixed(0), 2, 0);

    return `${symbol}${formattedMinutes}:${formattedSeconds}`;
  }
  getTime = (time) => {
    // format the seconds saved into 00:00:00
    const secs = time % 60;
    const s2 = (time - secs) / 60;
    const mins = s2 % 60;
    const hrs = (s2 - mins) / 60;
    const hours = this.addZeros(hrs) > 0 ? `${this.addZeros(hrs)}:` : '';
    return `${hours}${this.addZeros(mins)}:${this.addZeros(secs)}`;
  };
  addZeros = (time) => {
    return time < 10 ? `0${time}` : time;
  };

  /**
   * Set the position of the seekbar's components
   * (both fill and handle) according to the
   * position supplied.
   *
   * @param {float} position position in px of seeker handle}
   */
  setSeekerPosition(position = 0) {
    let state = this.state;
    position = this.constrainToSeekerMinMax(position);

    state.seekerFillWidth = position;
    state.seekerPosition = position;

    if (!state.seeking) {
      state.seekerOffset = position;
    }

    this.setState(state);
  }

  /**
   * Constrain the location of the seeker to the
   * min/max value based on how big the
   * seeker is.
   *
   * @param {float} val position of seeker handle in px
   * @return {float} constrained position of seeker handle in px
   */
  constrainToSeekerMinMax(val = 0) {
    if (val <= 0) {
      return 0;
    } else if (val >= this.player.seekerWidth) {
      return this.player.seekerWidth;
    }
    return val;
  }

  /**
   * Calculate the position that the seeker should be
   * at along its track.
   *
   * @return {float} position of seeker handle in px based on currentTime
   */
  calculateSeekerPosition() {
    const percent = this.state.currentTime / this.state.duration;
    return this.player.seekerWidth * percent;
  }

  /**
   * Return the time that the video should be at
   * based on where the seeker handle is.
   *
   * @return {float} time in ms based on seekerPosition.
   */
  calculateTimeFromSeekerPosition() {
    const percent = this.state.seekerPosition / this.player.seekerWidth;
    return this.state.duration * percent;
  }

  /**
   * Seek to a time in the video.
   *
   * @param {float} time time to seek to in ms
   */
  seekTo(time = 0) {
    let state = this.state;
    state.currentTime = time;
    this.player.ref.seek(time);
    this.setState(state);
  }

  /**
   * Set the position of the volume slider
   *
   * @param {float} position position of the volume handle in px
   */
  setVolumePosition(position = 0) {
    let state = this.state;
    position = this.constrainToVolumeMinMax(position);
    state.volumePosition = position + this.player.iconOffset;
    state.volumeFillWidth = position;

    state.volumeTrackWidth = this.player.volumeWidth - state.volumeFillWidth;

    if (state.volumeFillWidth < 0) {
      state.volumeFillWidth = 0;
    }

    if (state.volumeTrackWidth > 150) {
      state.volumeTrackWidth = 150;
    }

    this.setState(state);
  }

  /**
   * Constrain the volume bar to the min/max of
   * its track's width.
   *
   * @param {float} val position of the volume handle in px
   * @return {float} contrained position of the volume handle in px
   */
  constrainToVolumeMinMax(val = 0) {
    if (val <= 0) {
      return 0;
    } else if (val >= this.player.volumeWidth + 9) {
      return this.player.volumeWidth + 9;
    }
    return val;
  }

  /**
   * Get the volume based on the position of the
   * volume object.
   *
   * @return {float} volume level based on volume handle position
   */
  calculateVolumeFromVolumePosition() {
    return this.state.volumePosition / this.player.volumeWidth;
  }

  /**
   * Get the position of the volume handle based
   * on the volume
   *
   * @return {float} volume handle position in px based on volume
   */
  calculateVolumePositionFromVolume() {
    return this.player.volumeWidth * this.state.volume;
  }

  UNSAFE_componentWillMount() {
    this.initSeekPanResponder();
    this.initVolumePanResponder();
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.state.paused !== nextProps.paused) {
      this.setState({
        paused: nextProps.paused,
      });
    }

    if (this.styles.videoStyle !== nextProps.videoStyle) {
      this.styles.videoStyle = nextProps.videoStyle;
    }

    if (this.styles.containerStyle !== nextProps.style) {
      this.styles.containerStyle = nextProps.style;
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.clearControlTimeout();
    AppState.removeEventListener("change", this._handleAppStateChange);
  }

  initSeekPanResponder() {
    this.player.seekPanResponder = PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => true,

      onPanResponderGrant: (evt, gestureState) => {
        let state = this.state;
        this.clearControlTimeout();
        const position = evt.nativeEvent.locationX;
        this.setSeekerPosition(position);
        state.seeking = true;
        state.originallyPaused = state.paused;
        state.scrubbing = false;
        if (this.player.scrubbingTimeStep > 0) {
          state.paused = true;
        }
        this.setState(state);
      },

      onPanResponderMove: (evt, gestureState) => {
        const position = this.state.seekerOffset + gestureState.dx;
        this.setSeekerPosition(position);
        let state = this.state;

        if (
          this.player.scrubbingTimeStep > 0 &&
          !state.loading &&
          !state.scrubbing
        ) {
          const time = this.calculateTimeFromSeekerPosition();
          const timeDifference = Math.abs(state.currentTime - time) * 1000;

          if (
            time < state.duration &&
            timeDifference >= this.player.scrubbingTimeStep
          ) {
            state.scrubbing = true;

            this.setState(state);
            setTimeout(() => {
              this.player.ref.seek(time, this.player.scrubbingTimeStep);
            }, 1);
          }
        }
      },

      onPanResponderRelease: (evt, gestureState) => {
        const time = this.calculateTimeFromSeekerPosition();
        let state = this.state;
        if (time >= state.duration && !state.loading) {
          state.paused = true;
          this.events.onEnd();
        } else if (state.scrubbing) {
          state.seeking = false;
        } else {
          this.seekTo(time);
          this.setControlTimeout();
          state.paused = state.originallyPaused;
          state.seeking = false;
        }
        this.setState(state);
      },
    });
  }

  initVolumePanResponder() {
    this.player.volumePanResponder = PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => true,
      onPanResponderGrant: (evt, gestureState) => {
        this.clearControlTimeout();
      },

      onPanResponderMove: (evt, gestureState) => {
        let state = this.state;
        const position = this.state.volumeOffset + gestureState.dx;

        this.setVolumePosition(position);
        state.volume = this.calculateVolumeFromVolumePosition();

        if (state.volume <= 0) {
          state.muted = true;
        } else {
          state.muted = false;
        }

        this.setState(state);
      },

      onPanResponderRelease: (evt, gestureState) => {
        let state = this.state;
        state.volumeOffset = state.volumePosition;
        this.setControlTimeout();
        this.setState(state);
      },
    });
  }

  renderControl(children, callback, style = {}) {
    return (
      <TouchableHighlight
        underlayColor="transparent"
        activeOpacity={0.3}
        onPress={() => {
          this.resetControlTimeout();
          callback();
        }}
        style={[styles.controls.control, style]}>
        {children}
      </TouchableHighlight>
    );
  }

  renderNullControl() {
    return <View style={[styles.controls.control]} />;
  }

  renderCenterControls() {
    return (
      <Animated.View
        style={[
          styles.controls.top,
          {
            flex: 1,
            justifyContent: 'center',
            opacity: this.animations.topControl.opacity,
            backgroundColor: 'rgba(12,34,56,0.8)',
          },
        ]}>
        {this.state.showControls ? (
          <PlayButton
            duration={this.state.duration}
            onPress={() => {
              this.methods.togglePlayPause();
            }}
            onPressForward={() => {
              this.seekTo(this.state.currentTime + 5);
            }}
            onPressBackward={() => {
              this.seekTo(
                this.state.currentTime < 5
                  ? this.state.currentTime
                  : this.state.currentTime - 5,
              );
            }}
            paused={this.state.paused}
          />
        ) : null}
      </Animated.View>
    );
  }

  renderTopControls() {
    return Dimensions.get('window').height > Dimensions.get('window').width ? (
      <Animated.View
        style={[
          styles.controls.top,
          {
            opacity: this.animations.topControl.opacity,
            marginTop: this.animations.topControl.marginTop,
            backgroundColor: 'rgba(12,34,56,0.8)',
          },
        ]}>

        <SafeAreaView style={styles.topControls.container}>
          <View style={styles.topControls.row}>
            <View style={[styles.topControls.rowView, { flex: 1 }]}>
              <TouchableOpacity
                onPress={() => {
                  this.props.backToList();
                }}
                hitSlop={styles.topControls.backHitSlop}>
                <Image
                  style={styles.topControls.backIcon}
                  source={require('./VideoPlayerComponents/components/images/back_white.png')}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.topControls.rowView}>
              {this.props.isFavoriteShow ? <View style={styles.topControls.btnContainer}>
                <TouchableOpacity
                  onPress={() => {
                    this.props.favorite();
                  }}
                  hitSlop={styles.topControls.commonHitSlop}>
                  <Image
                    style={styles.topControls.favIcon}
                    source={
                      this.props.isFavorite
                        ? require('./VideoPlayerComponents/components/images/favourite.png')
                        : require('./VideoPlayerComponents/components/images/unfavourite.png')
                    }
                  />
                </TouchableOpacity>
              </View> : null}

              {this.props.isShareShow ? <View style={styles.topControls.btnContainer}>
                <TouchableOpacity
                  onPress={() => {
                    this.props.share();
                  }}
                  hitSlop={styles.topControls.commonHitSlop}>
                  <Image
                    style={styles.topControls.shareIcon}
                    source={require('./VideoPlayerComponents/components/images/share.png')}
                  />
                </TouchableOpacity>
              </View> : null}

              {this.props.isSettingShow ? <View style={styles.topControls.btnContainer}>
                <TouchableOpacity
                  onPress={() => {
                    this.props.onMorePress();
                  }}
                  hitSlop={styles.topControls.commonHitSlop}>
                  <Image
                    style={{ marginRight: 15 }}
                    source={require('./VideoPlayerComponents/components/images/icon_Settings.png')}
                  />
                </TouchableOpacity>
              </View> : null}

            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    ) : (
        <Animated.View
          style={[
            styles.controls.top,
            {
              opacity: this.animations.topControl.opacity,
              marginTop: this.animations.topControl.marginTop,
              backgroundColor: 'rgba(12,34,56,0.8)',
            },
          ]}>

          <View style={styles.topControls.container}>
            <View style={styles.topControls.row}>

              <View style={[styles.topControls.rowView, { flex: 1 }]}>
                <TouchableOpacity
                  onPress={() => {
                    this.props.backToList();
                  }}
                  hitSlop={styles.topControls.backHitSlop}>
                  <Image
                    style={styles.topControls.backIcon}
                    source={require('./VideoPlayerComponents/components/images/back_white.png')}
                  />
                </TouchableOpacity>
                <Text
                  style={[styles.topControls.title]}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {this.props.title}
                </Text>
                <Text style={styles.topControls.landscapeTitle}>
                  {this.getTime(parseInt(this.state.duration, 10))}
                </Text>
              </View>

              <View style={styles.topControls.rowView}>
                {this.props.isFavoriteShow ? <View style={styles.topControls.btnContainer}>
                  <TouchableOpacity
                    onPress={() => {
                      this.props.favorite();
                    }}
                    hitSlop={styles.topControls.commonHitSlop}>
                    <Image
                      style={styles.topControls.favIcon}
                      source={
                        this.props.isFavorite
                          ? require('./VideoPlayerComponents/components/images/favourite.png')
                          : require('./VideoPlayerComponents/components/images/unfavourite.png')
                      }
                    />
                  </TouchableOpacity>
                </View> : null}

                {this.props.isShareShow ? <View style={styles.topControls.btnContainer}>
                  <TouchableOpacity
                    onPress={() => {
                      this.props.share();
                    }}
                    hitSlop={styles.topControls.commonHitSlop}>
                    <Image
                      style={styles.topControls.shareIcon}
                      source={require('./VideoPlayerComponents/components/images/share.png')}
                    />
                  </TouchableOpacity>
                </View> : null}

                {this.props.isSettingShow ? <View style={styles.topControls.btnContainer}>
                  <TouchableOpacity
                    onPress={() => {
                      this.props.onMorePress();
                    }}
                    hitSlop={styles.topControls.commonHitSlop}>
                    <Image
                      style={{ marginRight: 15 }}
                      source={require('./VideoPlayerComponents/components/images/icon_Settings.png')}
                    />
                  </TouchableOpacity>
                </View> : null}

              </View>
            </View>
          </View>
        </Animated.View>
      );
  }
  seekTo(time = 0) {
    this.player.ref.seek(time);
  }

  onSeekRelease(percent) {
    this.setState({ seeking: false });
    this.seekTo(percent);
  }
  /**
   * Back button control
   */
  renderBack() {
    return this.renderControl(
      <Image
        source={require('./VideoPlayerComponents/components/images/back.png')}
        style={styles.controls.back}
      />,
      this.events.onBack,
      styles.controls.back,
    );
  }

  /**
   * Render the volume slider and attach the pan handlers
   */
  renderVolume() {
    return (
      <View style={styles.volume.container}>
        <View
          style={[styles.volume.fill, { width: this.state.volumeFillWidth }]}
        />
        <View
          style={[styles.volume.track, { width: this.state.volumeTrackWidth }]}
        />
        <View
          style={[styles.volume.handle, { left: this.state.volumePosition }]}
          {...this.player.volumePanResponder.panHandlers}>
          <Image
            style={styles.volume.icon}
            source={require('./VideoPlayerComponents/components/images/volume.png')}
          />
        </View>
      </View>
    );
  }

  /**
   * Render fullscreen toggle and set icon based on the fullscreen state.
   */
  renderFullscreen() {
    let source =
      this.state.isFullscreen === true
        ? require('./VideoPlayerComponents/components/images/shrink.png')
        : require('./VideoPlayerComponents/components/images/expand.png');
    return this.renderControl(
      <Image source={source} />,
      this.methods.toggleFullscreen,
      styles.controls.fullscreen,
    );
  }

  renderSeekbar() {
    return (
      <View
        style={styles.seekbar.container}
        collapsable={false}
        {...this.player.seekPanResponder.panHandlers}>
        <View
          style={styles.seekbar.track}
          onLayout={(event) =>
            (this.player.seekerWidth = event.nativeEvent.layout.width)
          }
          pointerEvents={'none'}>
          <View
            style={[
              styles.seekbar.fill,
              {
                width: this.state.seekerFillWidth,
                backgroundColor: this.props.seekColor || '#FFF',
              },
            ]}
            pointerEvents={'none'}
          />
        </View>
        <View
          style={[styles.seekbar.handle, { left: this.state.seekerPosition }]}
          pointerEvents={'none'}>
          <View
            style={[
              styles.seekbar.circle,
              { backgroundColor: this.props.seekColor || '#FFF' },
            ]}
            pointerEvents={'none'}
          />
        </View>
      </View>
    );
  }

  /**
   * Render the play/pause button and show the respective icon   
   */
  renderPlayPause() {
    let source =
      this.state.paused === true
        ? require('./VideoPlayerComponents/components/images/Play.png')
        : require('./VideoPlayerComponents/components/images/pause.png');
    return this.renderControl(
      <Image source={source} />,
      this.methods.togglePlayPause,
      styles.controls.playPause,
    );
  }

  /**
   * Render our title...if supplied.
   */
  renderTitle() {
    if (this.opts.title) {
      return (
        <View style={[styles.controls.control, styles.controls.title]}>
          <Text
            style={[styles.controls.text, styles.controls.titleText]}
            numberOfLines={1}>
            {this.opts.title || ''}
          </Text>
        </View>
      );
    }

    return null;
  }

  /**
   * Show our timer.
   */
  renderTimer() {
    return this.renderControl(
      <Text style={styles.controls.timerText}>{this.calculateTime()}</Text>,
      this.methods.toggleTimer,
      styles.controls.timer,
    );
  }

  /**
   * Show loading icon
   */
  renderLoader() {
    if (this.state.loading) {
      return (
        <View style={styles.loader.container}>
          <Animated.Image
            source={require('./VideoPlayerComponents/components/images/loader-icon.png')}
            style={[
              styles.loader.icon,
              {
                transform: [
                  {
                    rotate: this.animations.loader.rotate.interpolate({
                      inputRange: [0, 360],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      );
    }
    return null;
  }

  renderError() {
    if (this.state.error) {
      return (
        <View style={styles.error.container}>
          <Image
            source={require('./VideoPlayerComponents/components/images/error-icon.png')}
            style={styles.error.icon}
          />
          <Text style={styles.error.text}>Video unavailable</Text>
        </View>
      );
    }
    return null;
  }

  /**
   * Provide all of our options and render the whole component.
   */
  render() {
    return (
      <TouchableWithoutFeedback
        onPress={this.events.onScreenTouch}
        style={[styles.player.container, this.styles.containerStyle]}>
        <View style={[styles.player.container, this.styles.containerStyle]}>
          {this.props.isVideoSettingsOpen ? (
            <VideoSettings
              isOpen={this.props.isVideoSettingsOpen}
              onVideoSettingsClose={this.props.onVideoSettingsClose}
              qualityArray={this.props.qualityArray}
              boxSelected={this.props.boxSelected}
              IsQualityArray={this.props.IsQualityArray}
              IsAutoConnectionStatus={this.props.IsAutoConnectionStatus}
            />
          ) : null}
          <Video
            {...this.props}
            ref={(videoPlayer) => (this.player.ref = videoPlayer)}
            resizeMode={'contain'}
            volume={this.state.volume}
            paused={this.state.paused}
            muted={this.state.muted}
            rate={this.state.rate}
            onLoadStart={this.events.onLoadStart}
            onProgress={this.events.onProgress}
            onError={this.events.onError}
            fullscreenOrientation={'all'}
            style={[styles.player.video, this.styles.videoStyle]}
            onLoad={this.events.onLoad}
            onEnd={this.events.onEnd}
            onSeek={this.events.onSeek}
            style={[styles.player.video, this.styles.videoStyle]}
            source={this.props.source}
          />
          {this.renderError()}
          {this.renderLoader()}
          {this.renderTopControls()}
          {this.renderCenterControls()}
          <Slider
            currentTime={this.state.currentTime}
            duration={this.state.duration}
            onSeek={this._onSeek.bind(this)}
            onSeekRelease={this.onSeekRelease.bind(this)}
            containerStyle={{
              opacity: this.animations.bottomControl.opacity,
              marginBottom: this.animations.bottomControl.marginBottom,
              backgroundColor: 'rgba(12,34,56,0.8)',
              justifyContent: 'flex-start',
            }}
          />
        </View>
      </TouchableWithoutFeedback>
      // </View>
    );
  }
}

/**
 * This object houses our styles. There's player
 * specific styles and control specific ones.
 * And then there's volume/seeker styles.
 */
const styles = {
  player: StyleSheet.create({
    container: {
      overflow: 'hidden',
      backgroundColor: 'transparent',
      flex: 1,
      alignSelf: 'stretch',
      justifyContent: 'space-between',
    },
    video: {
      overflow: 'hidden',
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  }),
  error: StyleSheet.create({
    container: {
      backgroundColor: 'rgba( 0, 0, 0, 0.5 )',
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    icon: {
      marginBottom: 16,
    },
    text: {
      backgroundColor: 'transparent',
      color: '#f27474',
    },
  }),
  topControls: StyleSheet.create({
    container: {
      flex: 1,
      justifyContent:
        Dimensions.get('window').height > Dimensions.get('window').width
          ? 'space-between'
          : 'flex-start',
      paddingHorizontal: 5,
    },
    row: {
      flexDirection: 'row',
      height: 50,
    },
    rowView: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backIcon: {
      margin: 7,
      height: 22,
    },
    favIcon: {
      marginRight: 15,
      height: 25,
      width: 25,
    },
    shareIcon: {
      marginRight: 15,
      height: 22,
      width: 22,
    },
    title: {
      marginLeft: 10,
      fontSize: 17,
      fontWeight: '500',
      color: 'white',
    },
    landscapeTitle: {
      fontWeight: '600',
      marginLeft: 15,
      marginRight: 5,
      fontSize: 17,
      color: '#ffff',
    },
    timeText: {
      fontWeight: '600',
      marginLeft: 10,
      marginRight: 5,
      marginTop: 10,
      fontSize: 17,
      color: '#ffff',
    },
    btnContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    commonHitSlop: {
      top: 5,
      bottom: 5,
      left: 5,
      right: 5,
    },
    backHitSlop: {
      top: 10,
      bottom: 10,
      left: 10,
      right: 10,
    },
    bottomControlsView: {
      alignSelf: 'stretch',
      paddingLeft: 5,
      paddingRight: 5,
    },
    bottomSliderView: {
      alignSelf: 'stretch',
      alignItems: 'flex-end',
      paddingLeft: 5,
      paddingRight: 5,
      flexDirection: 'row',
      marginHorizontal: 15,
    },
  }),
  loader: StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
  controls: StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: null,
      width: null,
    },
    column: {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: null,
      width: null,
    },
    vignette: {
      resizeMode: 'stretch',
    },
    control: {
      padding: 16,
    },
    text: {
      backgroundColor: 'transparent',
      color: '#FFF',
      fontSize: 14,
      textAlign: 'center',
    },
    pullRight: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    top: {
      flex: 1,
      alignItems: 'stretch',
      justifyContent: 'flex-start',
    },
    bottom: {
      alignItems: 'stretch',
      flex: 1,
      justifyContent: 'flex-end',
    },
    topControlGroup: {
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexDirection: 'row',
      width: null,
      margin: 12,
      marginBottom: 18,
    },
    bottomControlGroup: {
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginLeft: 12,
      marginRight: 12,
      marginBottom: 0,
    },
    volume: {
      flexDirection: 'row',
    },
    fullscreen: {
      flexDirection: 'row',
    },
    playPause: {
      position: 'relative',
      width: 80,
      zIndex: 0,
    },
    title: {
      alignItems: 'center',
      flex: 0.6,
      flexDirection: 'column',
      padding: 0,
    },
    titleText: {
      textAlign: 'center',
    },
    timer: {
      width: 80,
    },
    timerText: {
      backgroundColor: 'transparent',
      color: '#FFF',
      fontSize: 11,
      textAlign: 'right',
    },
  }),
  volume: StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'flex-start',
      flexDirection: 'row',
      height: 1,
      marginLeft: 20,
      marginRight: 20,
      width: 150,
    },
    track: {
      backgroundColor: '#333',
      height: 1,
      marginLeft: 7,
    },
    fill: {
      backgroundColor: '#FFF',
      height: 1,
    },
    handle: {
      position: 'absolute',
      marginTop: -24,
      marginLeft: -24,
      padding: 16,
    },
    icon: {
      marginLeft: 7,
    },
  }),
  seekbar: StyleSheet.create({
    container: {
      alignSelf: 'stretch',
      height: 28,
      marginLeft: 20,
      marginRight: 20,
    },
    track: {
      backgroundColor: '#333',
      height: 1,
      position: 'relative',
      top: 14,
      width: '100%',
    },
    fill: {
      backgroundColor: '#FFF',
      height: 1,
      width: '100%',
    },
    handle: {
      position: 'absolute',
      marginLeft: -7,
      height: 28,
      width: 28,
    },
    circle: {
      borderRadius: 12,
      position: 'relative',
      top: 8,
      left: 8,
      height: 12,
      width: 12,
    },
  }),
};
