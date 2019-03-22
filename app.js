// var api = require('./pages/common/api.js');
import {
    Login
} from './pages/common/api.js';
import {
    Toast,
    ShowLoading
} from './pages/common/common.js';

const regeneratorRuntime = require('./packages/regenerator-runtime/runtime-module');
var isRefreshToken = false; // 是否在正在刷新token
var refreshSubscribers = []; // 正在刷新token时暂存请求
App({
    onLaunch: function(ops) {

    },
    regeneratorRuntime,
    // 獲取上頁面
    prevPageData() {
        var pages = getCurrentPages();
        // var currPage = pages[pages.length - 1];   //当前页面
        var prevPage = pages[pages.length - 2]; //上一个页面
        return prevPage
    },
    // 獲取設備信息
    getSystem() {
        let _this = this;
        wx.getSystemInfo({
            success(res) {
                _this.globalData.windowHeight = res.windowHeight
            }
        })
    },
    onShow: function(options) {
        this.checkUpdate();
        this.getSystem();
    },
    // 检查更新
    checkUpdate() {
        const updateManager = wx.getUpdateManager();
        updateManager.onCheckForUpdate(function(res) {
            console.log(res)
            if (res.hasUpdate) {
                updateManager.onUpdateReady(function() {
                    wx.showModal({
                        title: '更新提示',
                        content: '检查到有新版本,确定更新',
                        showCancel: false,
                        success: function(response) {
                            if (response.confirm) {
                                // 新的版本已经下载好，调用 applyUpdate 应用新版本并重启小程序               
                                updateManager.applyUpdate();
                            }
                        }
                    })
                })
                updateManager.onUpdateFailed(function() {
                    //当新版本下载失败，会进行回调          
                    wx.showModal({
                        title: '更新提示',
                        content: '检查到有新版本，但下载失败，请稍后尝试',
                        showCancel: false,
                    })
                })
            }
        })
    },
    // 获取完成路径
    getComplateUrl(that) {
        var urlOpt = '',
            route = that.route,
            opts = that.options;
        Object.keys(opts).forEach((v, i) => {
            if (i == 0) {
                urlOpt = `?${v}=${opts[v]}`
            } else if (i > 0) {
                urlOpt += `&${v}=${opts[v]}`
            }
        })
        return `/${route}${urlOpt}`;
    },
    // 判断token是否過期
    isTokenExpired() {
        let curTime = new Date().getTime(); // 当前时间
        return (curTime > this.globalData.loginMsg.Expires_In); // 是否过期
    },
    // 过滤掉不需要验证token的接口
    needlessAuth(method, url) {
        let Status = ["/Account/Login", "/Account/SendLoginCode", ].some(v => v === url)
        return Status
    },
    // 获取微信Code
    getWxCode() {
        return new Promise((resolve, reject) => {
            wx.login({
                success(res) {
                    resolve(res.code)
                }
            })
        })
    },
    // 监听接口返回状态
    CheckStatus: function(res, resolve) {
        switch (res.statusCode) {
            case 200:
                resolve(res.data)
                break;
            case 401:
                Toast('登录状态过期');
                break;
            case 400:
                Toast(res.data.ErrMsg);
                break;
            case 500:
                Toast('服务器异常，稍后重试');
                break;
            case 408:
                Toast('请求超时，请检查网络');
                break;
            case 403:
                Toast('服务器拒绝请求 code403');
                break;
            case 404:
                Toast('请求的网页不存在 code404');
                break;
            case 405:
                Toast('禁用请求中指定的方法  code405');
                break;
        }
    },
    // 刷新Token
    async refreshToken() {
        let wx_code = await this.getWxCode();
        let _this = this;
        return new Promise((resolve, reject) => {
            wx.request({
                method: "GET",
                url: _this.globalData.baseUrl + Login,
                data: {
                    wx_code,
                },
                dataType: "json",
                success: function(response) {
                    _this.CheckStatus(response, resolve)
                }
            })
        })
    },
    // 发送请求
    requestModel(reqData){
        const {
            method,
            url,
            params,
            that,
            loading,
        } = reqData;
        let Token = this.globalData.loginMsg.Access_Token;
        let TokenType = this.globalData.loginMsg.Token_Type;
        let _this = this;
        let paramSession = [{
            'content-type': 'application/json',
            'Authorization': `${TokenType} ${Token}`
        },
        {
            'content-type': 'application/json'
        },
        ]
        loading?ShowLoading(loading):'';
       return new Promise((resolve,reject) => {
            wx.request({
                url: _this.globalData.baseUrl + url,
                data: params,
                dataType: "json",
                header: paramSession[0],
                method: method,
                success: function (res) {
                    loading ? wx.hideLoading() : '';
                    _this.CheckStatus(res,resolve)
                },
                fail: function () {
                    loading?wx.hideLoading():'';
                    wx.showToast({
                        icon: 'none',
                        title: '请求出错！',
                    })
                },
                complete: function () {

                }
            })
        })
    },
     ajaxTest(method, url, params, that, loading = false) {
         return new Promise(async (resolve,reject)=>{
             var expire = this.isTokenExpired(), //token是否过期
                 isNoAuth = this.needlessAuth(url), // 接口是否需要Token验证
                 CurTime = new Date().getTime(), // 当前时间
                 reqData = {
                     method,
                     url,
                     params,
                     that,
                     loading
                 };
            // Token过期后进入
            if (expire && !isNoAuth) {
                refreshSubscribers.push(reqData)
                if (!isRefreshToken) {
                    // 正在刷新。。。
                    isRefreshToken = true;
                    const { Access_Token, Expires_In, Token_Type } = await this.refreshToken();
                    let loginMsg = {
                        Access_Token,
                        Token_Type,
                        Expires_In: parseInt(CurTime + parseInt(Expires_In * 1000)), // token过期时间
                        isLogin: true,
                    };
                    this.globalData.loginMsg = loginMsg;
                    isRefreshToken = false;
                    // token刷新成功后重新请求
                    refreshSubscribers.forEach(async v => {
                        resolve(await this.requestModel(v)) 
                    })
                    refreshSubscribers = []; // 
                }
            } else {
                resolve(await this.requestModel(reqData)) 
            } 
        })
    },
 
    onHide: function() {
        console.log('appononHide')
        // Do something when hide.

    },
    onError: function(msg) {
        console.log(msg)
    },
    globalData: {
        loginMsg: {
            Access_Token: '', // token
            Token_Type: '', // token 类型
            Expires_In: 0, // token有效期
            isLogin: false,
        },
        baseUrl: "",
        userInfo: null,
        scene: 1001, // 进入小程序的场景值 默认微信发现栏入
        windowHeight: '',

    }
})